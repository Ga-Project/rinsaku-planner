// コンポーネントが「文をそのまま描いているか」の検査。
//
// ■ なぜ要るか
//   この製品の判定文は3つの面（区画バナー・候補チップ・追加フォームのプレビュー）に
//   出るが、プランナー本体はクライアント描画なので**静的HTMLには1文字も出ない**。
//   そのため書き出し検査（verify-export）は原理的にこの層を見られず、lib のユニット
//   テストも `app/components/` を1件も読まない。実測で、次の退行がすべてのゲートを
//   緑のまま通り抜けた:
//     - プレビューに渡す判定年の取り違え（利用者に見える年が入力欄と食い違う）
//     - チップに渡す今年の取り違え（候補全件の文が別の分岐に化ける）
//     - 判定バナーの中身を空にする（判定文が丸ごと消える）
//   判定年の決め方は panelVerdicts の内側に閉じたので取り違えは起こせなくなったが、
//   「返ってきた文を描かない」退行は依然としてこの層にしか現れない。
//
// ■ 依存を増やさない
//   TypeScript（既存の devDependency）の transpileModule で .tsx を素の JS にし、
//   react-dom/server（既存の dependency）で描く。テストランナーも DOM 実装も足さない。
//   型検査はしない（tsc --noEmit が別途走る）。

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";

/** 生成物の置き場。app/ と同じ深さに置くので `../lib/*.mjs` がそのまま解決できる。 */
const BUILD = "app/.test-build";
const FILES = ["BedEditor", "PlantNow", "status-ui", "icons"];

/** @type {Record<string, any>} */
const mod = {};

before(async () => {
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  for (const name of FILES) {
    const src = readFileSync(`app/components/${name}.tsx`, "utf8");
    const { outputText } = ts.transpileModule(src, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      fileName: `${name}.tsx`,
    });
    // 生成物は app/.test-build/ に置くので、components からの相対を1段ぶん詰める。
    const fixed = outputText
      .replace(/from "\.\.\/lib\//g, 'from "../lib/')
      .replace(/from "\.\/(status-ui|icons|PlantNow)"/g, 'from "./$1.mjs"');
    writeFileSync(join(BUILD, `${name}.mjs`), fixed);
  }
  for (const name of FILES) {
    mod[name] = await import(
      pathToFileURL(join(process.cwd(), BUILD, `${name}.mjs`)).href
    );
  }
});

const noop = () => {};

/** 区画の編集パネルを実際に描画して HTML を返す。 */
function render(plantings, { currentYear = 2026, currentMonth = 9 } = {}) {
  const bed = {
    id: "b1",
    label: "畝1",
    kind: "row",
    plantings: plantings.map((p, i) => ({ id: `p${i}`, ...p })),
  };
  return renderToStaticMarkup(
    h(mod.BedEditor.BedEditor, {
      bed,
      currentYear,
      currentMonth,
      onUpdateBed: noop,
      onAddPlanting: noop,
      onRemovePlanting: noop,
      onDeleteBed: noop,
    }),
  );
}

/** クラス名で段落のテキストを取り出す。 */
function textOf(html, cls) {
  const m = html.match(new RegExp(`<p class="${cls}[^"]*"[^>]*>(.*?)</p>`, "s"));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

test("区画バナーに、判定した年と作物を主語にした文が実際に描かれる", () => {
  const html = render([
    { cropId: "tomato", year: 2026 },
    { cropId: "tomato", year: 2027 },
  ]);
  // 見出しは最新作付けを名乗る。
  assert.match(textOf(html, "muted verdict-scope"), /2027年 トマト/);
  // 本文は空でない完全な文であること（中身を落とす退行をここで捕まえる）。
  assert.equal(
    textOf(html, "verdict"),
    "2026年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。いまある記録のままだと、どの作付けからも4年あくのは早くて2031年です。",
  );
});

test("バナーの判定年は最新作付けの年で、閲覧年ではない", () => {
  // 同じ区画を別の年から見ても、判定そのものは動かない。
  const a = textOf(render([{ cropId: "tomato", year: 2024 }, { cropId: "tomato", year: 2026 }], { currentYear: 2026 }), "verdict");
  const b = textOf(render([{ cropId: "tomato", year: 2024 }, { cropId: "tomato", year: 2026 }], { currentYear: 2028 }), "verdict");
  for (const t of [a, b]) {
    assert.match(t, /^2024年に同じ科の作付けがあります。間隔は2年で、トマトの目安4年に足りません。/);
  }
  // 暦が進むと締めだけが変わる（置ける年が来ていないか、過ぎたか）。
  assert.match(a, /早くて2030年です。$/);
  assert.match(b, /早くて2030年です。$/);
});

test("候補チップは、その候補自身の作物名と目安年数で語る", () => {
  // バナーが ng になる配置にして、同じパネルに2つの目安年数を並べる。
  const html = render(
    [
      { cropId: "tomato", year: 2026 },
      { cropId: "tomato", year: 2027 },
    ],
    { currentMonth: 9 },
  );
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
  const potato = labels.find((l) => l.startsWith("ジャガイモ"));
  assert.ok(potato, "ジャガイモの候補が描かれていない");
  // 同じパネルでバナーは「トマトの目安4年」、チップは「ジャガイモの目安3年」。
  assert.match(potato, /ジャガイモの目安3年/);
  assert.match(textOf(html, "verdict"), /トマトの目安4年/);
  // チップに、チップからは実行できない助言（判定年をずらす）を出さない。
  assert.doesNotMatch(potato, /どちらかをずらす/);
});

test("チップの判定年は暦から決まる（閲覧年をずらすと文も追従する）", () => {
  const near = render([{ cropId: "tomato", year: 2027 }], { currentMonth: 9, currentYear: 2026 });
  const far = render([{ cropId: "tomato", year: 2027 }], { currentMonth: 9, currentYear: 2040 });
  const pick = (html) =>
    [...html.matchAll(/aria-label="([^"]*)"/g)]
      .map((m) => m[1])
      .find((l) => l.startsWith("ジャガイモ"));
  // 2026年に見れば 2027年の計画と1年しかあかない。
  assert.match(pick(near), /間隔は1年で/);
  // 2040年に見れば十分あいているので、同じ候補が別の判定になる。
  assert.doesNotMatch(pick(far), /目安3年に足りません/);
});

test("チップが名乗る年は、その候補を植えることになる年そのもの", () => {
  // 同じ年に同じ科がすでにある候補は、文の先頭でその年を名乗る。ここが
  // チップの判定年が表に出る唯一の形なので、取り違えをここで固定する。
  const html = render([{ cropId: "tomato", year: 2026 }], {
    currentMonth: 3,
    currentYear: 2026,
  });
  const potato = [...html.matchAll(/aria-label="([^"]*)"/g)]
    .map((m) => m[1])
    .find((l) => l.startsWith("ジャガイモ"));
  assert.ok(potato, "ジャガイモの候補が描かれていない");
  assert.match(
    potato,
    /2026年には、同じ科の作付けがもう1件あります。/,
    `チップが植える年と違う年を名乗っている: ${potato}`,
  );
});

test("作物マスタに無い作付けは、理由を画面に出す", () => {
  const html = render([{ cropId: "not-a-crop", year: 2026 }]);
  assert.match(
    textOf(html, "verdict is-empty"),
    /2026年の作付けの作物が一覧にないため、この区画は判定できません。/,
  );
});

test("候補が0件の月でも、見出しと不在の説明は必ず描く", () => {
  // 締めの文が「「いま植えるなら」で確かめてください」と誘導するので、
  // ここをセクションごと消すとその文が宙に浮く。
  const html = render([], { currentMonth: 12 });
  assert.match(html, /いま植えるなら/);
  assert.match(html, /種まき・植え付けの適期を迎える作物はありません/);
});

test("コンポーネントは判定文を自前で組み立てない", () => {
  // 文の出どころを verdictCopy 1か所に保つ。ここが破れると、面ごとに文がずれる。
  for (const name of ["BedEditor", "PlantNow", "status-ui"]) {
    const src = readFileSync(`app/components/${name}.tsx`, "utf8");
    // コメントを除いたコードだけを見る（設計意図の説明には語が出てよい）。
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 群見出しの注記（「間隔が、目安に足りません」等）は面の説明であって判定文では
    // ないので対象にしない。判定文にしか現れない語だけを禁じる。
    // 「おおよその目安です」のような一般語ではなく、判定文に固有の形で見る。
    assert.doesNotMatch(
      code,
      /の目安\$\{|の目安\d+年/,
      `${name}.tsx が目安年数の文を自前で持っている`,
    );
    for (const banned of [
      "をこえています",
      "どの作付けからも",
      "ずらすことになります",
      "いまある記録のままだと",
      "同じ科の作付けがあります",
    ]) {
      assert.ok(
        !code.includes(banned),
        `${name}.tsx が判定文を自前で持っている: ${banned}`,
      );
    }
  }
});
