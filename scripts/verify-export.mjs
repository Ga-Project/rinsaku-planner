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
import { join, sep } from "node:path";
import { cropSlugs, cropUrl, cropIndexUrl, cropPage, shortFamilyName } from "../app/lib/cropPages.mjs";
import { FAMILIES } from "../app/lib/crops.mjs";
import { SITE_URL } from "../app/lib/site.mjs";
import {
  familySlugs,
  familyUrl,
  familyPage,
  familyPath,
} from "../app/lib/familyPages.mjs";
import { CROPS } from "../app/lib/crops.mjs";
import {
  familyReference,
  representativeValueNote,
  rotationYearsLabel,
  rotationTier,
} from "../app/lib/reference.mjs";
import { OG_IMAGE } from "../app/lib/og.mjs";

const outDir = process.argv[2] ?? "out";
const basePath = (process.argv[3] ?? process.env.BASE_PATH ?? "").replace(
  /\/+$/,
  "",
);

const failures = [];
const fail = (msg) => failures.push(msg);

// 期待URL（SITE_URL）は環境変数 BASE_PATH から、リンクの照合は引数の basePath から作る。
// 片方だけ渡すと、正しい成果物でも全ページが偽の失敗になる（逆に両方が同じ誤りなら
// 検査が素通りする）。食い違いはここで止めて、どちらを直すべきかを言う。
{
  const envBase = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
  if (envBase !== basePath) {
    console.error(
      `basePath の指定が食い違っています: 引数 "${basePath}" / 環境変数 BASE_PATH "${envBase}"。` +
        `ビルドと同じ BASE_PATH を環境変数でも渡してください（例: BASE_PATH=${basePath || "/rinsaku-planner"} node scripts/verify-export.mjs ${outDir} ${basePath}）。`,
    );
    process.exit(2);
  }
}

/** OGP 画像の期待URL（metadataBase = SITE_URL 起点で解決される）。 */
const OG_IMAGE_URL = new URL(OG_IMAGE.url, SITE_URL).href;

/** タグとコメントを落とした本文テキスト（React は隣接テキストの間に <!-- --> を挟む）。 */
function textOf(fragment) {
  return decodeEntities(fragment.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, ""));
}

/** aria-labelledby="<id>" の section 1つぶんの HTML。無ければ null。 */
function sectionOf(s, id) {
  const start = s.indexOf(`aria-labelledby="${id}"`);
  if (start < 0) return null;
  const end = s.indexOf("</section>", start);
  return s.slice(start, end < 0 ? undefined : end);
}

/** チップの並び [名前, 年数ラベル|null]。 */
function chipsOf(fragment) {
  return [
    ...fragment.matchAll(
      /class="crop-chip-name">([\s\S]*?)<\/span>(?:<span class="crop-chip-sub">([\s\S]*?)<\/span>)?/g,
    ),
  ].map((m) => [textOf(m[1]), m[2] === undefined ? null : textOf(m[2])]);
}

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
  { dir: join("yasai", "ka"), url: `${SITE_URL}yasai/ka/`, label: "科索引" },
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

// 期待値の定数。lib の関数（familyIndexUrl 等）を経由せず、ここで書き下す。lib が壊れたとき
// 期待値も一緒に壊れて検査が黙ることを避ける（URL は SITE_URL 起点の固定の形）。
const INDEX_LABEL = "野菜別 連作ガイド";
const FAMILY_INDEX_LABEL = "科別 連作ガイド";
const FAMILY_INDEX_TITLE = "科別 連作ガイド｜科ごとにあける年数の一覧";
const familyIndexHref = `${SITE_URL}yasai/ka/`;
const familyHref = (key) => `${SITE_URL}yasai/ka/${key}/`;
const toHref = (abs) => `${basePath}/${abs.slice(SITE_URL.length)}`;

/**
 * パンくず: 構造化データ（名前・URL・順序の全項目）と、画面のパンくず（文字とリンク先）が
 * 期待どおりか。末尾だけ見る検査だと、途中の段が落ちても通る。
 * @param {string} label
 * @param {string} s 書き出した HTML
 * @param {[string, string][]} want [名前, 絶対URL] を上位から順に
 */
function checkCrumbs(label, s, want) {
  const blocks = [];
  for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch (e) {
      fail(`${label}: 構造化データが JSON として読めない（${e.message}）`);
    }
  }
  const lds = blocks.filter((b) => b["@type"] === "BreadcrumbList");
  if (lds.length !== 1) fail(`${label}: BreadcrumbList が ${lds.length} 個（期待 1 個）`);
  const ld = lds[0];
  const got = (ld?.itemListElement ?? []).map((i) => [i.position, i.name, i.item]);
  const exp = want.map(([n, u], i) => [i + 1, n, u]);
  if (JSON.stringify(got) !== JSON.stringify(exp)) {
    fail(`${label}: 構造化データのパンくずが ${JSON.stringify(got)}（期待 ${JSON.stringify(exp)}）`);
  }
  const nav = s.match(/<nav class="crumbs[^"]*" aria-label="パンくず">([\s\S]*?)<\/nav>/)?.[1] ?? "";
  const items = [...nav.matchAll(/<li(?: aria-current="page")?>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const screen = items.map((h) => {
    const a = h.match(/^<a href="([^"]*)">([\s\S]*?)<\/a>$/);
    return a ? [textOf(a[2]), a[1]] : [textOf(h), null];
  });
  const screenExp = want.map(([n, u], i) => [n, i < want.length - 1 ? toHref(u) : null]);
  if (JSON.stringify(screen) !== JSON.stringify(screenExp)) {
    fail(`${label}: 画面のパンくずが ${JSON.stringify(screen)}（期待 ${JSON.stringify(screenExp)}）`);
  }
}

// meta description の上限。lib の DESCRIPTION_MAX を読まず、ここに書き下す（lib の値を緩めても
// 検査が一緒に緩まない。両者のずれは lib の test が固定している）。全ページに適用する。
const DESC_MAX = 120;

// パンくずの期待値（トップ以外の読み物ページ）。科の索引・科ページは下の専用ブロックで見る。
for (const p of pages) {
  if (p.dir === "yasai") {
    p.crumbs = [["畑めぐり", SITE_URL], [INDEX_LABEL, `${SITE_URL}yasai/`]];
  } else if (p.dir.startsWith(`yasai${sep}`) && !p.dir.startsWith(`yasai${sep}ka`)) {
    const id = p.dir.slice(`yasai${sep}`.length);
    const crop = CROPS.find((c) => c.id === id);
    p.crumbs = [["畑めぐり", SITE_URL], [INDEX_LABEL, `${SITE_URL}yasai/`], [crop?.nameJa ?? id, `${SITE_URL}yasai/${id}/`]];
  }
}

for (const p of pages) {
  const s = html(p.dir);
  if (s === null) continue;

  // canonical はページ固有でなければならない（layout に置くと全ページ同じになる）
  const canonical = s.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical !== p.url) {
    fail(`${p.label}: canonical が ${canonical} （期待 ${p.url}）`);
  }

  // OGP: 画像・URL・タイトルがページ固有で残っているか
  // 画像は「タグがあるか」ではなく URL まで見る（basePath 抜けの og.png は 404 になる）。
  // twitter も openGraph と同じく layout と deep-merge されないので、同じ基準で見る。
  const ogImage = s.match(/property="og:image" content="([^"]+)"/)?.[1];
  if (ogImage !== OG_IMAGE_URL) {
    fail(`${p.label}: og:image が ${ogImage} （期待 ${OG_IMAGE_URL}）`);
  }
  const twCard = s.match(/name="twitter:card" content="([^"]+)"/)?.[1];
  if (twCard !== "summary_large_image") {
    fail(`${p.label}: twitter:card が ${twCard} （期待 summary_large_image）`);
  }
  const twImage = s.match(/name="twitter:image" content="([^"]+)"/)?.[1];
  if (twImage !== OG_IMAGE_URL) {
    fail(`${p.label}: twitter:image が ${twImage} （期待 ${OG_IMAGE_URL}）`);
  }
  const ogUrl = s.match(/property="og:url" content="([^"]+)"/)?.[1];
  if (ogUrl !== p.url) {
    fail(`${p.label}: og:url が ${ogUrl} （期待 ${p.url}）`);
  }

  // 検索結果で切れない長さ。全ページの書き出した meta そのものに当てる（構造化データの有無とも独立）。
  {
    const d = s.match(/<meta name="description" content="([^"]*)"/)?.[1];
    if (d === undefined) fail(`${p.label}: meta description が無い`);
    else {
      const n = [...decodeEntities(d)].length;
      if (n > DESC_MAX) fail(`${p.label}: meta description が ${n} 字（上限 ${DESC_MAX}）`);
    }
  }

  // h1 はちょうど1つ（消えても重複しても、見出し構造が壊れる）。
  {
    const n = [...s.matchAll(/<h1[\s>]/g)].length;
    if (n !== 1) fail(`${p.label}: h1 が ${n} 個（期待 1 個）`);
  }
  if (p.crumbs) checkCrumbs(p.label, s, p.crumbs);

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
      if (metaDesc === undefined) fail(`${p.label}: meta description が無い`);
      else if (decodeEntities(metaDesc) !== article.description) {
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

// 科の索引（/yasai/ka/）: URL を1階層削った人の行き止まりをなくす入口。索引が全科ページへ
// 張り、各科ページと野菜索引が索引へ戻る。片方向でも欠けると行き止まりが戻る。
// 期待値は lib を経由せず、定数と CROPS・FAMILIES から数え直す。
{
  const idx = html(join("yasai", "ka")) ?? "";
  const fams = FAMILIES.filter((f) => CROPS.filter((c) => c.familyKey === f.key).length >= 2);
  const famKeys = fams.map((f) => f.key);

  // <h1> の中身（タイトル・パンくず・フッターにも同じ文字列が出るので、h1 に限定する）
  const h1s = [...idx.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1]));
  if (JSON.stringify(h1s) !== JSON.stringify([FAMILY_INDEX_LABEL])) {
    fail(`科索引: h1 が ${JSON.stringify(h1s)}（期待 ["${FAMILY_INDEX_LABEL}"]）`);
  }

  // title / description（meta・og・twitter）の期待値を定数と FAMILIES から組む
  const wantDesc = `${fams.map((f) => shortFamilyName(f.nameJa)).join("・")}の${fams.length}科について、植えるまでにあけたい年数と、あとに植えやすい野菜を科ごとにまとめた一覧です。`;
  const meta = (attr, name) => {
    const v = idx.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
    return v === undefined ? undefined : decodeEntities(v);
  };
  const title = textOf(idx.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
  if (title !== FAMILY_INDEX_TITLE) fail(`科索引: title が「${title}」（期待「${FAMILY_INDEX_TITLE}」）`);
  for (const [attr, name, want, what] of [
    ["name", "description", wantDesc, "meta description"],
    ["property", "og:description", wantDesc, "og:description"],
    ["name", "twitter:description", wantDesc, "twitter:description"],
    ["property", "og:title", FAMILY_INDEX_TITLE, "og:title"],
    ["name", "twitter:title", FAMILY_INDEX_TITLE, "twitter:title"],
  ]) {
    const got = meta(attr, name);
    if (got !== want) fail(`科索引: ${what} が「${got}」（期待「${want}」）`);
  }

  checkCrumbs("科索引", idx, [
    ["畑めぐり", SITE_URL],
    [INDEX_LABEL, `${SITE_URL}yasai/`],
    [FAMILY_INDEX_LABEL, familyIndexHref],
  ]);

  // 科ページへのリンクは本文（科の節）の中だけを見る。ヘッダー・フッターの導線が増えても落ちない。
  const bodyStart = idx.indexOf('aria-labelledby="families-h"');
  const bodyEnd = idx.indexOf('class="reference-faq');
  if (bodyStart < 0 || bodyEnd < bodyStart) fail("科索引: 科の節の範囲（families-h〜reference-faq）が取れない");
  const body = bodyStart < 0 || bodyEnd < bodyStart ? "" : idx.slice(bodyStart, bodyEnd);
  const linked = [...body.matchAll(/href="([^"]*\/yasai\/ka\/[^"]+)"/g)].map((m) => m[1]);
  const wantLinks = famKeys.map((k) => `${basePath}/yasai/ka/${k}/`);
  if (JSON.stringify(linked) !== JSON.stringify(wantLinks)) {
    fail(`科索引: 科ページへのリンクが ${JSON.stringify(linked)}（期待 ${JSON.stringify(wantLinks)}）`);
  }

  for (const f of fams) {
    const key = f.key;
    const at = idx.indexOf(`aria-labelledby="fam-${key}"`);
    if (at < 0) {
      fail(`科索引: ${key} の節が無い`);
      continue;
    }
    const secEnd = idx.indexOf("</section>", at);
    const one = idx.slice(at, secEnd < 0 ? undefined : secEnd);
    const h3 = textOf(one.match(/<h3 id="fam-[^"]*">([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (h3 !== f.nameJa) fail(`科索引: ${key} の見出しが「${h3}」（期待「${f.nameJa}」）`);

    const members = CROPS.filter((c) => c.familyKey === key);
    const years = members.map((c) => c.rotationYears);
    const min = Math.min(...years);
    const max = Math.max(...years);
    const rangeLabel = max === 0 ? "続けて植えやすい" : min === max ? `${max}年` : min === 0 ? `最長${max}年` : `${min}〜${max}年`;
    const wantYears = max === 0 ? "続けて植えやすい科" : `あけたい年数 ${rangeLabel}`;
    const cell = one.match(/<span class="ref-years ([^"]*)">([\s\S]*?)<\/span>/);
    if (!cell || textOf(cell[2]) !== wantYears) {
      fail(`科索引: ${key} の年数の欄が「${cell ? textOf(cell[2]) : "（無し）"}」（期待「${wantYears}」）`);
    }
    if (!cell || cell[1] !== `is-${rotationTier(max)}`) {
      fail(`科索引: ${key} の年数の段階が「${cell?.[1]}」（期待「is-${rotationTier(max)}」）`);
    }

    const got = chipsOf(one).map((x) => x.join("|")).sort();
    const exp = members.map((c) => `${c.nameJa}|${rotationYearsLabel(c.rotationYears)}`).sort();
    if (JSON.stringify(got) !== JSON.stringify(exp)) fail(`科索引: ${key} の野菜一覧が作物マスタと違う`);

    // 科ページからも索引へ戻れる
    const fp = html(join("yasai", "ka", key)) ?? "";
    if (!fp.includes(`href="${basePath}/yasai/ka/"`)) fail(`科 ${key}: 科索引へ戻るリンクが無い`);
    checkCrumbs(`科 ${key}`, fp, [
      ["畑めぐり", SITE_URL],
      [INDEX_LABEL, `${SITE_URL}yasai/`],
      [FAMILY_INDEX_LABEL, familyIndexHref],
      [f.nameJa, familyHref(key)],
    ]);
  }
  if (!(html("yasai") ?? "").includes(`href="${basePath}/yasai/ka/"`)) {
    fail("野菜索引: 科索引へのリンクが無い");
  }
}

// 野菜索引（/yasai/）の科ごとの節: 年数の欄・段階・見出し・野菜チップが、作物マスタから
// 数え直した値と一致するか。科の代表値に描き替える／1つの年数で言い切る事故が、科索引と
// 同じ型で起きうる。見出し（h1）の内容もここで固定する。
{
  const yi = html("yasai") ?? "";
  const h1s = [...yi.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1]));
  if (JSON.stringify(h1s) !== JSON.stringify([INDEX_LABEL])) {
    fail(`野菜索引: h1 が ${JSON.stringify(h1s)}（期待 ["${INDEX_LABEL}"]）`);
  }
  const fromIdx = yi.indexOf('aria-labelledby="byfam-h"');
  if (fromIdx < 0) fail("野菜索引: 「科から探す」の節が無い");
  for (const f of FAMILIES) {
    const members = CROPS.filter((c) => c.familyKey === f.key);
    if (members.length === 0) continue;
    const at = yi.indexOf(`aria-labelledby="fam-${f.key}"`, Math.max(fromIdx, 0));
    if (at < 0) {
      fail(`野菜索引: ${f.key} の節が無い`);
      continue;
    }
    const end = yi.indexOf("</section>", at);
    const one = yi.slice(at, end < 0 ? undefined : end);
    const h3 = textOf(one.match(/<h3 id="fam-[^"]*">([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (h3 !== f.nameJa) fail(`野菜索引: ${f.key} の見出しが「${h3}」（期待「${f.nameJa}」）`);
    const years = members.map((c) => c.rotationYears);
    const min = Math.min(...years);
    const max = Math.max(...years);
    const range = min === max ? `${max}年` : min === 0 ? `最長${max}年` : `${min}〜${max}年`;
    const wantYears = max === 0 ? "続けて植えやすい科" : `あけたい年数 ${range}`;
    const cell = one.match(/<span class="ref-years ([^"]*)">([\s\S]*?)<\/span>/);
    if (!cell || textOf(cell[2]) !== wantYears) {
      fail(`野菜索引: ${f.key} の年数の欄が「${cell ? textOf(cell[2]) : "（無し）"}」（期待「${wantYears}」）`);
    }
    if (!cell || cell[1] !== `is-${rotationTier(max)}`) {
      fail(`野菜索引: ${f.key} の年数の段階が「${cell?.[1]}」（期待「is-${rotationTier(max)}」）`);
    }
    const got = chipsOf(one).map((x) => x.join("|")).sort();
    const exp = members.map((c) => `${c.nameJa}|${rotationYearsLabel(c.rotationYears)}`).sort();
    if (JSON.stringify(got) !== JSON.stringify(exp)) fail(`野菜索引: ${f.key} の野菜一覧が作物マスタと違う`);
  }
}

// 科ページの本文: 年数の欄・リード文・年数の決まり方・所属野菜の一覧が、所属野菜
// ごとの値で書かれているか。期待値は familyPage() を経由せず CROPS から数え直す
// （lib が壊れたとき期待値も一緒に壊れると、ここは何も言わなくなる）。
// 守りたいのは「科を1つの年数で言い切らない」こと。ナス科ならジャガイモは3年で、
// 「4年」と言い切ったページは同じ製品の判定と食い違う。
for (const key of familySlugs()) {
  const label = `科 ${key}`;
  const s = html(join("yasai", "ka", key));
  if (s === null) continue;
  const members = CROPS.filter((c) => c.familyKey === key);
  const years = members.map((c) => c.rotationYears);
  const min = Math.min(...years);
  const max = Math.max(...years);
  const longest = members.filter((c) => c.rotationYears === max);
  const shortest = members.filter((c) => c.rotationYears === min);
  const expectedYears =
    max === 0 ? "続けて植えやすい" : min === max ? `${max}年` : min === 0 ? `最長${max}年` : `${min}〜${max}年`;

  const lead = s.slice(s.indexOf('class="crop-lead"'), s.indexOf("</section>", s.indexOf('class="crop-lead"')));
  if (!s.includes('class="crop-lead"')) {
    fail(`${label}: 冒頭の節（crop-lead）が無い`);
    continue;
  }
  const yearsCell = lead.match(/<span class="ref-years[^"]*">([\s\S]*?)<\/span>/)?.[1];
  if (yearsCell === undefined || textOf(yearsCell) !== expectedYears) {
    fail(`${label}: 年数の欄が「${yearsCell === undefined ? "（無し）" : textOf(yearsCell)}」（期待「${expectedYears}」）`);
  }
  const leadText = textOf(lead.match(/<p class="ref-lead">([\s\S]*?)<\/p>/)?.[1] ?? "");
  const leadNeeds =
    max === 0 ? [] : min === max ? [`${max}年`] : min === 0 ? [`${max}年`, ...shortest.map((c) => c.nameJa)] : [`${min}〜${max}年`];
  for (const n of leadNeeds) {
    if (!leadText.includes(n)) fail(`${label}: リード文に「${n}」が無い（${leadText}）`);
  }
  const note = lead.match(/<p class="crop-note">([\s\S]*?)<\/p>/)?.[1];
  if (min !== max && max > 0) {
    if (note === undefined) fail(`${label}: 野菜ごとに年数が割れるのに「年数の決まり方」が無い`);
    else {
      const t = textOf(note);
      const needs = [longest[0].nameJa, shortest[0].nameJa, `${max}年`, ...(min > 0 ? [`${min}年`] : [])];
      for (const n of needs) if (!t.includes(n)) fail(`${label}: 「年数の決まり方」に「${n}」が無い（${t}）`);
      // 名前と年数が含まれるだけでは、作る側と植える側を入れ替えた文（向きの逆転）が通る。
      // 句ごとに「誰の何年か」を取り出し、年数が植える側の野菜のものかを CROPS で検算する。
      const byName = new Map(members.map((c) => [c.nameJa, c]));
      const yearsClauses = [
        ...t.matchAll(/([^、。]+?)を作った場所に([^、。]+?)を植えるなら(?:要るのは)?([^、。]+?)の(\d+)年/g),
      ];
      for (const [, made, planted, whose, n] of yearsClauses) {
        const next = byName.get(planted);
        if (!byName.has(made) || !next) {
          fail(`${label}: 「年数の決まり方」の句の野菜が所属野菜に無い（${made} → ${planted}）`);
        } else if (whose !== planted || Number(n) !== next.rotationYears) {
          fail(`${label}: 「年数の決まり方」が植える側（${planted}・${next.rotationYears}年）でなく「${whose}の${n}年」を挙げている`);
        }
      }
      const zeroClauses = [...t.matchAll(/([^、。]+?)を作った場所でも([^、。]+?)なら続けて植えやすく/g)];
      for (const [, made, planted] of zeroClauses) {
        if (!byName.has(made) || byName.get(planted)?.rotationYears !== 0) {
          fail(`${label}: 「続けて植えやすい」と言う側（${planted}）が、あき年数0の所属野菜でない`);
        }
      }
      const wantYears = min > 0 ? 2 : 1;
      if (yearsClauses.length !== wantYears || zeroClauses.length !== (min > 0 ? 0 : 1)) {
        fail(`${label}: 「年数の決まり方」の句の数が想定と違う（年数の句 ${yearsClauses.length}・続けて植えやすいの句 ${zeroClauses.length}）`);
      }
    }
  }
  // 正しい幅を書いた文の横に「ナス科はどれも4年」を足されても上の照合は通る。年数が割れる科では、
  // 本文のどこでも科を主語に1つの年数で言い切らせない（テストの禁止形と同じ形を書き出しに当てる）。
  if (min !== max) {
    const fam = shortFamilyName(FAMILIES.find((f) => f.key === key).nameJa);
    const main = textOf(s.slice(s.indexOf("<main"), s.indexOf("</main>")));
    const banned = [
      new RegExp(`${fam}(?:の野菜)?は(?:どれも|すべて|一律に?)?、?\\d+年`),
      new RegExp(`${fam}を最後に作ってから、?\\d+年`),
    ];
    for (const re of banned) {
      const hit = main.match(re);
      if (hit) fail(`${label}: 年数が割れる科なのに1つの年数で言い切っている（「${hit[0]}」）`);
    }
  }
  const membersSec = sectionOf(s, "members-h");
  if (membersSec === null) fail(`${label}: 所属野菜の節が無い`);
  else {
    const got = chipsOf(membersSec);
    const want = members.map((c) => [c.nameJa, rotationYearsLabel(c.rotationYears)]);
    const key2 = (xs) => JSON.stringify([...xs].map((x) => x.join("|")).sort());
    if (key2(got) !== key2(want)) {
      fail(`${label}: 所属野菜の一覧が作物マスタと違う（画面 ${got.map((x) => x.join(":")).join(", ")}）`);
    }
  }
}

// 野菜ページの年数の欄も同じ型で壊れうる（科の代表値に描き替える）ので、作物ごとの値と照合する。
for (const c of CROPS) {
  const s = html(join("yasai", c.id));
  if (s === null) continue;
  const cell = s.match(/<span class="ref-years[^"]*">([\s\S]*?)<\/span>/)?.[1];
  const want = rotationYearsLabel(c.rotationYears);
  if (cell === undefined || textOf(cell) !== want) {
    fail(`野菜 ${c.id}: 年数の欄が「${cell === undefined ? "（無し）" : textOf(cell)}」（期待「${want}」）`);
  }
  // 科ページへのリンクは自分の科を指す1本だけ（科ページの無い科なら0本）。
  const famLinks = [...s.matchAll(/href="([^"]*\/yasai\/ka\/[^"]*)"/g)].map((m) => m[1]);
  const own = familySlugs().includes(c.familyKey) ? [`${basePath}${familyPath(c.familyKey)}`] : [];
  if (JSON.stringify(famLinks) !== JSON.stringify(own)) {
    fail(`野菜 ${c.id}: 科ページへのリンクが ${JSON.stringify(famLinks)}（期待 ${JSON.stringify(own)}）`);
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
