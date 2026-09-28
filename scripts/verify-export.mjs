// 書き出した静的サイト（out/）そのものを検査する。
//
// ■ なぜ要るか
//   ユニットテストは lib 層しか見ない。だが実際に壊れるのは「Next がメタデータを
//   どう合成したか」「basePath がリンクに付いたか」といった、ビルドを通したあとに
//   しか現れない性質で、そこはテストが1件も反応しない。
//   実例: page 側で openGraph を定義すると layout の images が丸ごと落ちるため、
//   59ページ全部の og:image が消えていた。素の href="/" は basePath が付かず
//   配信オリジンのルート（＝製品の外）へ飛んでいた。どちらも lib は無傷。
//
// ■ どこで走るか
//   CI の build ジョブで pnpm build の直後。ここで落とせば公開まで進まない。
//
// 使い方: node scripts/verify-export.mjs <outDir> [basePath]
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cropSlugs, cropUrl, cropIndexUrl, cropPage } from "../app/lib/cropPages.mjs";
import { SITE_URL } from "../app/lib/site.mjs";
import { familySlugs, familyUrl, familyPage, familyPath } from "../app/lib/familyPages.mjs";
import { CROPS } from "../app/lib/crops.mjs";
import {
  familyReference,
  representativeValueNote,
} from "../app/lib/reference.mjs";

const outDir = process.argv[2] ?? "out";
const basePath = (process.argv[3] ?? process.env.BASE_PATH ?? "").replace(
  /\/+$/,
  "",
);

const failures = [];
const fail = (msg) => failures.push(msg);

/** HTML 実体参照を戻す（Next は属性値・本文の & < > " ' を実体化して書き出す）。 */
function decodeEntities(t) {
  return t
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** out/ 内の HTML を読む。無ければそれ自体が失敗。 */
function html(relDir) {
  const file = join(outDir, relDir, "index.html");
  if (!existsSync(file)) {
    fail(`書き出されていない: ${file}`);
    return null;
  }
  return readFileSync(file, "utf8");
}

const pages = [
  { dir: ".", url: SITE_URL, label: "トップ" },
  { dir: "yasai", url: cropIndexUrl(), label: "野菜索引" },
  ...familySlugs().map((key) => ({
    dir: join("yasai", "ka", key),
    url: familyUrl(key),
    label: `科 ${key}`,
    data: familyPage(key),
  })),
  ...cropSlugs().map((slug) => ({
    dir: join("yasai", slug),
    url: cropUrl(slug),
    label: `野菜 ${slug}`,
    data: cropPage(slug),
  })),
];

for (const p of pages) {
  const s = html(p.dir);
  if (s === null) continue;

  // canonical はページ固有でなければならない（layout に置くと全ページ同じになる）
  const canonical = s.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical !== p.url) {
    fail(`${p.label}: canonical が ${canonical} （期待 ${p.url}）`);
  }

  // OGP: 画像・URL・タイトルがページ固有で残っているか
  if (!/property="og:image"/.test(s)) {
    fail(`${p.label}: og:image が無い（layout の images が落ちている）`);
  }
  const ogUrl = s.match(/property="og:url" content="([^"]+)"/)?.[1];
  if (ogUrl !== p.url) {
    fail(`${p.label}: og:url が ${ogUrl} （期待 ${p.url}）`);
  }

  // 構造化データ: 画面と同じ事実だけを持つか。ページ側で JSON-LD だけを書き換えても
  // lib のテストは反応しないので、書き出した HTML の ld+json を読んで突き合わせる。
  if (p.data) {
    const blocks = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]),
    );
    const byType = (t) => blocks.find((b) => b["@type"] === t);
    const article = byType("Article");
    const crumbs = byType("BreadcrumbList");
    const faq = byType("FAQPage");
    const metaDesc = s.match(/<meta name="description" content="([^"]*)"/)?.[1];
    if (!article) fail(`${p.label}: Article の構造化データが無い`);
    else {
      if (article.description !== p.data.description) fail(`${p.label}: Article.description が本文と違う`);
      if (metaDesc !== undefined && decodeEntities(metaDesc) !== article.description) {
        fail(`${p.label}: meta description と Article.description が違う`);
      }
      if (article.mainEntityOfPage?.["@id"] !== p.url) fail(`${p.label}: Article の @id が canonical と違う`);
      if (article.headline !== p.data.title) fail(`${p.label}: Article.headline がタイトルと違う`);
    }
    if (!crumbs || crumbs.itemListElement?.at(-1)?.item !== p.url) {
      fail(`${p.label}: パンくずの末尾が canonical と違う`);
    }
    const expectedFaq = p.data.faq.map((f) => [f.q, f.a]);
    const actualFaq = (faq?.mainEntity ?? []).map((q) => [q.name, q.acceptedAnswer?.text]);
    if (JSON.stringify(actualFaq) !== JSON.stringify(expectedFaq)) {
      fail(`${p.label}: FAQPage が画面の FAQ と違う`);
    }
    const plain = decodeEntities(s);
    for (const [q, a] of expectedFaq) {
      if (!plain.includes(q) || !plain.includes(a)) fail(`${p.label}: FAQ「${q}」が画面に描画されていない`);
    }
  }

  // basePath: 内部リンクは必ず basePath 配下。素の href="/" が1つでもあれば製品の外へ出る
  if (basePath) {
    const bare = s.match(/href="\/(?!\/)(?!$)[^"]*"/g) ?? [];
    const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const outside = bare.filter((h) => !new RegExp(`^href="${escaped}/`).test(h));
    if (s.includes('href="/"')) outside.push('href="/"');
    if (outside.length > 0) {
      fail(`${p.label}: basePath の外へ出るリンク ${[...new Set(outside)].join(", ")}`);
    }
  }
}

// 404 は static export で「存在しない URL の唯一の受け皿」。ここのリンクが外に出ていると
// 打ち間違えた利用者を必ず取り逃がすので、他ページと同じ基準で見る。
const notFound = join(outDir, "404.html");
if (!existsSync(notFound)) {
  fail("404.html が書き出されていない");
} else {
  const s = readFileSync(notFound, "utf8");
  if (s.includes('href="/"')) fail("404: ホームへ戻るリンクに basePath が付いていない");
  if (!/noindex/.test(s)) fail("404: noindex が付いていない");
}

// 早見表の「科の代表値であって判定の年数ではない」という但し書きは、トップの
// 静的HTMLにしか現れない（プランナー本体はクライアント描画）。ユニットテストは
// familyReference() の値は見るが、それが描画されるかは見ないので、注記を消しても
// 型・lint・テストは全部緑のまま公開まで通る。ここで落とす。
// 割れ幅の注記と代表値の注は、期待値を作物マスタから導出して突き合わせる
// （マスタを直せば期待値も追従する）。列見出しだけは画面固有の文言なので
// 直書きで照合する。
{
  const top = html(".") ?? "";
  const fams = familyReference();
  const labels = [...new Set(fams.map((f) => f.yearsVaryLabel).filter(Boolean))];
  if (labels.length === 0) {
    fail("早見表: 年数が割れる科が1つも無い（導出が壊れている）");
  }
  for (const label of labels) {
    if (!top.includes(label)) {
      fail(`早見表: 割れ幅の注記「${label}」が書き出されていない`);
    }
  }
  const note = representativeValueNote();
  if (!top.includes(note)) {
    fail("早見表: 代表値の注（野菜ごとの値との違い）が書き出されていない");
  }
  if (!top.includes("科の目安（代表値）")) {
    fail("早見表: 列見出しが「代表値」と名乗っていない");
  }
}

// 科ページへの導線: 索引と、所属野菜のページから張られているか。ページを足しても
// 入口が無ければ誰も辿り着かないので、リンクの有無を書き出しで確かめる。
{
  const bp = basePath;
  const index = html("yasai") ?? "";
  for (const key of familySlugs()) {
    const href = `href="${bp}${familyPath(key)}"`;
    if (!index.includes(href)) fail(`野菜索引: 科ページ ${key} へのリンクが無い`);
    for (const c of CROPS.filter((x) => x.familyKey === key)) {
      const s = html(join("yasai", c.id)) ?? "";
      if (!s.includes(href)) fail(`野菜 ${c.id}: 科ページ ${key} へのリンクが無い`);
    }
  }
}

// sitemap は全ページを列挙し、列挙した URL の実ファイルが存在すること
const sitemapFile = join(outDir, "sitemap.xml");
if (!existsSync(sitemapFile)) {
  fail("sitemap.xml が書き出されていない");
} else {
  const locs = [...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  const expected = pages.map((p) => p.url);
  for (const url of expected) {
    if (!locs.includes(url)) fail(`sitemap に載っていない: ${url}`);
  }
  for (const url of locs) {
    if (!expected.includes(url)) fail(`sitemap に実在しない URL: ${url}`);
  }
}

if (failures.length > 0) {
  console.error(`書き出しの検査に失敗しました（${failures.length}件）:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`書き出しの検査に成功しました（${pages.length} ページ + 404 + sitemap）`);
