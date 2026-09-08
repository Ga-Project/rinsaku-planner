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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cropSlugs, cropUrl, cropIndexUrl } from "../app/lib/cropPages.mjs";
import { plannerHrefForCrop } from "../app/lib/cropFocus.mjs";
import { SITE_URL } from "../app/lib/site.mjs";

const outDir = process.argv[2] ?? "out";
const basePath = (process.argv[3] ?? process.env.BASE_PATH ?? "").replace(
  /\/+$/,
  "",
);

const failures = [];
const fail = (msg) => failures.push(msg);

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
  ...cropSlugs().map((slug) => ({
    dir: join("yasai", slug),
    url: cropUrl(slug),
    label: `野菜 ${slug}`,
    // その野菜を持ったままプランナーへ渡すリンク（?crop=）が残っているか。
    focusSlug: slug,
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

  // 野菜ページからプランナーへ、その野菜の名前を持って渡せているか。
  // ここが素の "/#app" に戻ると、検索で来た人は着いた先で同じ野菜を
  // もう一度選び直すことになる。59ページぶん静かに劣化し、
  // lib を見るユニットテストは1件も反応しない。
  // 期待値はリンク生成器そのものから作る（検査側に文字列を書き写さない）。
  if (p.focusSlug) {
    const expected = `href="${basePath}${plannerHrefForCrop(p.focusSlug)}"`;
    const hits = s.split(expected).length - 1;
    // ヘッダーと本文の2箇所。片方が素の "/#app" に戻る退行を捉える。
    if (hits < 2) {
      fail(
        `${p.label}: プランナーへ野菜を渡すリンクが ${hits} 箇所（期待 2・${expected}）`,
      );
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

// 「植えたい野菜」の帯そのものがクライアントの束に載っているか。
//
// この帯は "use client" の PlannerApp が mount 後に window.location.search を
// 読んでから描画するので、書き出した HTML には一切現れない（意図どおり）。
// そのため帯を描く JSX を丸ごと消しても、型・lint・テスト・ここまでの検査は
// すべて緑のまま通る＝野菜ページ側の 59 本のリンクだけが残り、
// 押した先には何も無い、という壊れ方をする。
//
// 束に帯の目印が残っていることを見て、その壊れ方だけは捉える。
// ※ これは「コードが載っていること」しか見ない。読み取りの配線そのもの
//   （search を読んで state に入れる1行）が消えた場合はここでは捉えられず、
//   実ブラウザでの確認が要る。
const CLIENT_MARKERS = ["crop-focus-bed", "crop-focus-headline"];
const chunkDir = join(outDir, "_next", "static", "chunks");
if (!existsSync(chunkDir)) {
  fail(`クライアントの束が書き出されていない: ${chunkDir}`);
} else {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".js")) files.push(full);
    }
  };
  walk(chunkDir);
  const bundle = files.map((f) => readFileSync(f, "utf8")).join("\n");
  for (const marker of CLIENT_MARKERS) {
    if (!bundle.includes(marker)) {
      fail(`「植えたい野菜」の帯が束に無い（目印 ${marker}）`);
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
