// verify-export.mjs の負例テスト: 壊した out/ で、各検査が実際に落ちることを確かめる。
//
// 検査が「通ること」しか確かめていないと、検査そのものが黙って弱くなっても誰も気づかない
// （見出し検査が <title> にも当たって素通りしていた、など）。ここでは正常な out/ を
// 1か所ずつ壊し、verify-export が失敗し、狙った検査が名指しで落ちることを要求する。
//
// 使い方: node scripts/verify-export-negative.mjs <outDir> [basePath]
//   outDir は同じ BASE_PATH でビルド済みであること。out/ 自体は変更しない（一時コピーを壊す）。
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const outDir = process.argv[2] ?? "out";
const basePath = (process.argv[3] ?? process.env.BASE_PATH ?? "").replace(/\/+$/, "");
const verify = fileURLToPath(new URL("./verify-export.mjs", import.meta.url));

function run(dir) {
  const r = spawnSync("node", [verify, dir, basePath], {
    env: { ...process.env, BASE_PATH: basePath },
    encoding: "utf8",
  });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
}

/** 一時コピーの file 内で from を to に置き換える。置換が起きなければ負例自体が無効なので落とす。 */
const replace = (file, from, to) => (dir) => {
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  const after = before.replace(from, to);
  if (after === before) throw new Error(`負例が当たらない: ${file} に ${String(from)} が無い`);
  writeFileSync(path, after);
};

const FAM = "yasai/ka/index.html";
const SOL = "yasai/ka/solanaceae/index.html";

const cases = [
  ["索引の h1 を別の文言に", replace(FAM, /<h1([^>]*)>科別 連作ガイド<\/h1>/, "<h1$1>連作ガイド</h1>"), "科索引: h1"],
  ["索引の h1 を h2 に降格", replace(FAM, /<h1([^>]*)>(科別 連作ガイド)<\/h1>/, "<h2$1>$2</h2>"), "科索引: h1"],
  ["索引のナス科の年数を1つの値に言い切る", replace(FAM, "あけたい年数 3〜4年", "あけたい年数 4年"), "科索引: solanaceae の年数の欄"],
  ["索引の年数の段階の class を変える", replace(FAM, /ref-years is-heavy/, "ref-years is-none"), "年数の段階"],
  ["索引の野菜チップの年数を変える", replace(FAM, /(<span class="crop-chip-name">トマト<\/span><span class="crop-chip-sub">)4年/, "$13年"), "野菜一覧が作物マスタと違う"],
  ["索引の科見出しを変える", replace(FAM, /(<\/span>)ナス科(<\/span><\/h3>)/, "$1ウリ科$2"), "見出しが"],
  ["索引の BreadcrumbList を消す", replace(FAM, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"BreadcrumbList".*?<\/script>/, ""), "科索引: 構造化データのパンくず"],
  ["索引の画面のパンくずから野菜別を落とす", replace(FAM, /<li><a href="[^"]*\/yasai\/">野菜別 連作ガイド<\/a><\/li>/, ""), "科索引: 画面のパンくず"],
  ["索引の description を差し替える", replace(FAM, /(<meta name="description" content=")[^"]*"/, '$1別の説明"'), "科索引: meta description"],
  ["索引の title を差し替える", replace(FAM, /<title>[^<]*<\/title>/, "<title>別のタイトル</title>"), "科索引: title"],
  ["索引から科ページへのリンクを1本落とす", replace(FAM, /<a href="[^"]*\/yasai\/ka\/lamiaceae\/">[^<]*<\/a>/, ""), "科索引: 科ページへのリンク"],
  ["科ページの構造化パンくずから索引の段を落とす", replace(SOL, /\{"@type":"ListItem","position":3,"name":"科別 連作ガイド","item":"[^"]*"\},/, ""), "科 solanaceae: 構造化データのパンくず"],
  ["科ページの画面のパンくずから索引の段を落とす", replace(SOL, /<li><a href="[^"]*\/yasai\/ka\/">科別 連作ガイド<\/a><\/li>/, ""), "科 solanaceae: 画面のパンくず"],
  ["科ページから索引へ戻るリンクを全て落とす", (dir) => {
    const path = join(dir, SOL);
    const s = readFileSync(path, "utf8").replace(/<a href="[^"]*\/yasai\/ka\/">/g, "<a href=\"#\">");
    writeFileSync(path, s);
  }, "科索引へ戻るリンクが無い"],
  ["科ページの description を120字超に伸ばす", (dir) => {
    const path = join(dir, SOL);
    const s = readFileSync(path, "utf8").replace(/(<meta name="description" content="[^"]*)"/, `$1${"あ".repeat(80)}"`);
    writeFileSync(path, s);
  }, "meta description が"],
  ["野菜ページの description を120字超に伸ばす", (dir) => {
    const path = join(dir, "yasai/tomato/index.html");
    const s = readFileSync(path, "utf8").replace(/(<meta name="description" content="[^"]*)"/, `$1${"あ".repeat(80)}"`);
    writeFileSync(path, s);
  }, "野菜 tomato: meta description が"],
  ["野菜索引から科索引へのリンクを落とす", replace("yasai/index.html", /<a href="[^"]*\/yasai\/ka\/">[^<]*<\/a>/, "<span>x</span>"), "野菜索引: 科索引へのリンクが無い"],
  ["sitemap から科索引を落とす", replace("sitemap.xml", /<url>\s*<loc>[^<]*\/yasai\/ka\/<\/loc>[\s\S]*?<\/url>\s*/, ""), "sitemap に載っていない"],
];

const base = run(outDir);
if (base.code !== 0) {
  console.error("正常な out/ が verify-export を通らない。負例の前に直すこと:\n" + base.text);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "verify-neg-"));
let bad = 0;
try {
  for (const [name, mutate, expect] of cases) {
    const dir = join(work, "out");
    rmSync(dir, { recursive: true, force: true });
    cpSync(outDir, dir, { recursive: true });
    try {
      mutate(dir);
    } catch (e) {
      console.error(`NG  ${name}: ${e.message}`);
      bad++;
      continue;
    }
    const r = run(dir);
    if (r.code === 0) {
      console.error(`NG  ${name}: 壊したのに verify-export が通った`);
      bad++;
    } else if (!r.text.includes(expect)) {
      console.error(`NG  ${name}: 落ちたが狙った検査（「${expect}」）ではない\n${r.text.split("\n").slice(0, 6).join("\n")}`);
      bad++;
    } else {
      console.log(`OK  ${name}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (bad > 0) {
  console.error(`負例テストに失敗しました（${bad}/${cases.length}件）`);
  process.exit(1);
}
console.log(`負例テストに成功しました（${cases.length}件）`);
