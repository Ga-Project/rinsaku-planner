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
import { cropSlugs, cropUrl, cropIndexUrl, cropPage, shortFamilyName } from "../app/lib/cropPages.mjs";
import { FAMILIES } from "../app/lib/crops.mjs";
import { SITE_URL } from "../app/lib/site.mjs";
import { familySlugs, familyUrl, familyPage, familyPath } from "../app/lib/familyPages.mjs";
import { CROPS } from "../app/lib/crops.mjs";
import {
  familyReference,
  representativeValueNote,
  rotationYearsLabel,
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
