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
import { CROPS, cropById } from "../app/lib/crops.mjs";
import { panelVerdicts } from "../app/lib/verdictCopy.mjs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";

/** 生成物の置き場。app/ と同じ深さに置くので `../lib/*.mjs` がそのまま解決できる。 */
const BUILD = "app/.test-build";
const FILES = ["BedEditor", "BedGrid", "PlantNow", "status-ui", "icons"];

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
function render(
  plantings,
  { currentYear = 2026, currentMonth = 9, initialCropId, initialYear } = {},
) {
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
      initialCropId,
      initialYear,
    }),
  );
}

/** クラス名で段落のテキストを取り出す。 */
/**
 * 段落のテキストを取り出す。`cls` は class 属性の**完全一致**で指定する
 * （前方一致にすると "verdict is-ok" を探したつもりで "verdict is-unknown" を
 *  拾うなど、状態が増えたときに別の段落を見てしまう）。
 */
function textOf(html, cls) {
  const m = html.match(new RegExp(`<p class="${cls}"[^>]*>(.*?)</p>`, "s"));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

/** 判定バナー（ok / caution / ng のいずれか1つ）の本文。 */
function verdictText(html) {
  for (const st of ["is-ok", "is-caution", "is-ng"]) {
    const t = textOf(html, `verdict ${st}`);
    if (t !== null) return t;
  }
  return null;
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
    verdictText(html),
    "この2027年のトマトから見ると、2026年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。いまある記録のままだと、2027年より後で、どの作付けからも4年あくのは早くて2031年です。",
  );
});

test("バナーの判定年は最新作付けの年で、閲覧年ではない", () => {
  // 同じ区画を別の年から見ても、判定そのものは動かない。
  const a = verdictText(render([{ cropId: "tomato", year: 2024 }, { cropId: "tomato", year: 2026 }], { currentYear: 2026 }));
  const b = verdictText(render([{ cropId: "tomato", year: 2024 }, { cropId: "tomato", year: 2026 }], { currentYear: 2028 }));
  for (const t of [a, b]) {
    assert.match(
      t,
      /^この2026年のトマトから見ると、2024年に同じ科の作付けがあります。間隔は2年で、トマトの目安4年に足りません。/,
    );
  }
  // 置ける年（2030年）がどちらの視点からもまだ来ていないので、締めも同じ。
  // バナーが閲覧年で揺れないことをここで固定する。
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
  assert.match(verdictText(html), /トマトの目安4年/);
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
    /2026年には、同じ科の作付けがほかにもあります。/,
    `チップが植える年と違う年を名乗っている: ${potato}`,
  );
});

test("チップの可視ラベルは、その候補自身の科名をそのまま出す", () => {
  // この層は tsc / lint / lib のテストのどれからも見えない。可視ラベルの
  // 切り詰め・差し替えをここで捕まえる。
  // ⚠️ 「マスタのどれかの科名である」では弱い。括弧を剥がした結果も、別の実在
  //    科名に差し替えた結果もその条件を満たしてしまう。**その候補自身の科名と
  //    一致するか**で見る。
  // 10月はタマネギが出るので、括弧付きの科名が VISIBLE_LIMIT に切られず描かれる。
  const html = render([], { currentMonth: 10 });
  const byName = new Map(CROPS.map((c) => [c.nameJa, c.familyJa]));

  const chips = [
    ...html.matchAll(
      /<span class="plantnow-chip-name">([^<]*)<\/span><span class="plantnow-chip-family">([^<]*)<\/span>/g,
    ),
  ].map((m) => ({ name: m[1], family: m[2] }));
  assert.ok(chips.length > 0, "チップが描かれていない");

  for (const c of chips) {
    assert.equal(
      c.family,
      byName.get(c.name),
      `${c.name} の科名が候補自身のものと違う（表示: ${c.family}）`,
    );
  }

  // 針の生存確認。括弧付きの科名が1件も描かれない月だと、剥がす退行を見られない。
  assert.ok(
    chips.some((c) => c.family.includes("（")),
    "括弧付きの科名が1件も描かれていない（この検査は括弧剥がしを見られない）",
  );
});

test("作物マスタに無い作付けは、理由を画面に出す", () => {
  const html = render([{ cropId: "not-a-crop", year: 2026 }]);
  assert.match(
    textOf(html, "verdict is-unknown"),
    /2026年の作付けの作物が一覧にありません。下の「作付けの記録」でその行を削除し、作物を選び直して追加してください。/,
  );
});

/** 区画グリッドを描画して HTML を返す。 */
function renderGrid(plantings) {
  const garden = {
    rows: 1,
    cols: 1,
    beds: [
      {
        id: "b1",
        label: "畝1",
        kind: "row",
        col: 0,
        row: 0,
        plantings: plantings.map((p, i) => ({ id: `p${i}`, ...p })),
      },
    ],
  };
  return renderToStaticMarkup(
    h(mod.BedGrid.BedGrid, {
      garden,
      selectedBedId: null,
      onSelectBed: noop,
      onAddBedAt: noop,
    }),
  );
}

test("グリッドと編集パネルは、同じ区画に同じ状態名を出す", () => {
  // 片方だけを unknown にすると、スクロールせずに両方見える位置で、同じ区画に
  // ついて「未設定」と「判定できません」が同時に出る。これは今回の変更が
  // 潰している欠陥（同じパネルの2面が食い違う）と同型。
  for (const plantings of [
    [],
    [{ cropId: "tomato", year: 2026 }],
    [{ cropId: "not-a-crop", year: 2026 }],
    // ⚠️ 「未知が最新でない」配置を必ず含める。ここが抜けていたため、バッジの
    //    導出規則を変えたときグリッド側だけ取り残された退行を素通りさせた。
    [
      { cropId: "not-a-crop", year: 2020 },
      { cropId: "tomato", year: 2026 },
    ],
    [
      { cropId: "not-a-crop", year: 2020 },
      { cropId: "tomato", year: 2025 },
      { cropId: "tomato", year: 2026 },
    ],
  ]) {
    const grid = renderGrid(plantings);
    const panel = render(plantings);
    const label = (html) => {
      const m = html.match(/<span class="bed-state [^"]*"><svg[\s\S]*?<\/svg><span>([^<]*)<\/span>/);
      return m ? m[1] : null;
    };
    assert.equal(
      label(grid),
      label(panel),
      `状態名が食い違っている (${JSON.stringify(plantings)}): グリッド=${label(grid)} / パネル=${label(panel)}`,
    );
  }
  // 針の生存確認。抽出器が実際にラベルを取れていること（文面には依存しない）。
  const label = (html) => {
    const m = html.match(
      /<span class="bed-state [^"]*"><svg[\s\S]*?<\/svg><span>([^<]*)<\/span>/,
    );
    return m ? m[1] : null;
  };
  const noMaterial = renderGrid([{ cropId: "not-a-crop", year: 2026 }]);
  assert.ok(
    label(noMaterial) && label(noMaterial).length > 0,
    "判定材料の無い区画からラベルを抽出できていない（抽出器が壊れている）",
  );

  // 「判定の材料が無い」区画と「判定は出たが数えられていない記録がある」区画は、
  // グリッド上で見分けられなければならない。同じラベルに潰すと、データが壊れた
  // 区画と、良い側の結論が出ている区画が完全に同じ見た目になる。
  const partial = renderGrid([
    { cropId: "not-a-crop", year: 2018 },
    { cropId: "tomato", year: 2026 },
  ]);
  assert.ok(label(partial), "一部未判定の区画からラベルを抽出できていない");
  assert.notEqual(
    label(noMaterial),
    label(partial),
    `判定材料が無い区画と一部未判定の区画が同じラベル（${label(partial)}）になっている`,
  );
});

test("グリッドのセルは、記録があるのに作物未登録と言わない", () => {
  // 作物が一覧に無いだけで記録はある。真に空の区画と同じ文字列にすると
  // 「記録なし」と読めてしまう（同じセルのバッジは「判定できません」と出る）。
  const withUnknown = renderGrid([{ cropId: "not-a-crop", year: 2026 }]);
  assert.match(withUnknown, /作物不明（2026）/);
  assert.doesNotMatch(withUnknown, /作物未登録/);

  // 本当に記録が無い区画は従来どおり。
  const empty = renderGrid([]);
  assert.match(empty, /作物未登録/);
  assert.doesNotMatch(empty, /作物不明/);
});

test("候補が0件の月でも、見出しと不在の説明は必ず描く", () => {
  // 締めの文が「「いま植えるなら」で確かめてください」と誘導するので、
  // ここをセクションごと消すとその文が宙に浮く。
  const html = render([], { currentMonth: 12 });
  assert.match(html, /いま植えるなら/);
  assert.match(html, /種まき・植え付けの適期を迎える作物はありません/);
});

test("判定に入れていない記録の但し書きは、候補群とプレビューの両方に届く", () => {
  // 候補群の側は実描画で確かめられる。
  const html = render([
    { cropId: "not-a-crop", year: 2020 },
    { cropId: "corn", year: 2026 },
  ]);
  assert.match(html, /作物が一覧にない2020年の記録があります/);

  // プレビューは作物を選んだときだけ描かれ、その状態は BedEditor の内部にあるので
  // SSR では踏めない。ここだけはソースで「両方に渡していること」を固定する。
  // （描画で検査できないことを承知のうえの narrow なガード。）
  const src = readFileSync("app/components/BedEditor.tsx", "utf8");
  // 候補群は長文、プレビューは短い変種。同じ文を2枠並べると 320px で
  // 画面1枚ぶんが同じ注意書きになるので、別の prop を渡している。
  // 出現回数で見るのは、片方だけ差し替える退行を「どちらも登場する」で
  // 通してしまわないため。
  const longUses = [...src.matchAll(/panel\.undecidableNotice\b/g)].length;
  const shortUses = [...src.matchAll(/panel\.undecidablePreviewNote\b/g)].length;
  assert.equal(longUses, 1, `長文の配り先が1箇所でない: ${longUses}`);
  assert.equal(shortUses, 2, `短い変種の配り先が2箇所でない: ${shortUses}`);
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

// ---------------------------------------------------------------------------
// 3面それぞれが「返ってきた文と状態」をそのまま描いていることの固定
//
// ソース文字列の出現回数で数えると、描画を丸ごと消す退行でも数が変わらないため
// 針にならない（実測で素通りした）。ここでは panelVerdicts の返り値を正本として、
// 実際に描かれた段落の**本文とクラス**の両方を突き合わせる。
// ---------------------------------------------------------------------------

/** 判定段落（本文・状態クラス）をすべて取り出す。 */
function verdicts(html) {
  return [...html.matchAll(/<p class="verdict (is-[a-z]+)"[^>]*>(.*?)<\/p>/gs)].map(
    (m) => ({ cls: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }),
  );
}

test("プレビュー面は、返ってきた文と状態をそのまま描く", () => {
  // 作物を選ぶまでプレビューは現れないので、初期値を渡して到達させる。
  // これが無いと、プレビューの配線は描画を伴う検査に一度も掛からない。
  let reached = 0;
  for (const [plantings, cropId, year] of [
    [[{ cropId: "tomato", year: 2025 }], "tomato", 2026],
    [[{ cropId: "tomato", year: 2020 }], "eggplant", 2026],
    [[{ cropId: "komatsuna", year: 2027 }], "komatsuna", 2026],
    [[{ cropId: "not-a-crop", year: 2018 }, { cropId: "tomato", year: 2026 }], "tomato", 2027],
  ]) {
    const html = render(plantings, { initialCropId: cropId, initialYear: year });
    const p = panelVerdicts({
      plantings,
      month: 9,
      currentYear: 2026,
      formCropId: cropId,
      formYear: year,
      cropLookup: cropById,
      crops: CROPS,
    });
    assert.notEqual(p.preview, null, "前提: プレビューが組み立てられていない");
    reached++;

    const shown = verdicts(html);
    const hit = shown.filter((v) => v.text === p.preview.text);
    assert.ok(
      hit.length > 0,
      `プレビューの文が描かれていない。期待: ${p.preview.text}\n実際に出た段落: ${JSON.stringify(shown, null, 1)}`,
    );
    assert.ok(
      hit.some((v) => v.cls === `is-${p.preview.status}`),
      `プレビューの状態が食い違う。期待 is-${p.preview.status} / 実際 ${hit.map((v) => v.cls).join(",")}`,
    );
  }
  assert.ok(reached === 4, `検査に到達した配置が少ない: ${reached}`);
});

test("区画バナーは、バッジと同じ状態をクラスにも出す", () => {
  // バッジの文言だけを見る検査では、バナー側の色・アイコンだけを別状態へ
  // 差し替える退行が通る（「判定できません」の真下にバナーが緑で並ぶ）。
  let reached = 0;
  for (const plantings of [
    [{ cropId: "tomato", year: 2025 }],
    [{ cropId: "tomato", year: 2024 }, { cropId: "tomato", year: 2026 }],
    [{ cropId: "not-a-crop", year: 2020 }, { cropId: "tomato", year: 2026 }],
    [{ cropId: "not-a-crop", year: 2018 }, { cropId: "komatsuna", year: 2026 }],
  ]) {
    const html = render(plantings);
    const p = panelVerdicts({
      plantings,
      month: 9,
      currentYear: 2026,
      formCropId: "",
      formYear: "",
      cropLookup: cropById,
      crops: CROPS,
    });
    if (p.banner === null) continue;
    reached++;
    const hit = verdicts(html).filter((v) => v.text === p.banner.text);
    assert.ok(hit.length > 0, `バナーの文が描かれていない: ${p.banner.text}`);

    // 状態クラスは「状態名と同じ綴り」ではない（partial は unknown と同じ中性面を
    // 共有し、区別はラベルが持つ）。ここで固定したいのは綴りではなく、
    // **同じパネルに並ぶバッジとバナーが同じ状態を名乗ること**。
    const badgeCls = html.match(/<span class="bed-state (is-[a-z]+)"/);
    assert.ok(badgeCls, "バッジが描かれていない");
    assert.ok(
      hit.some((v) => v.cls === badgeCls[1]),
      `バッジ(${badgeCls[1]})とバナー(${hit.map((v) => v.cls).join(",")})が別の状態を名乗っている`,
    );
  }
  assert.ok(reached === 4, `バナーに到達した配置が少ない: ${reached}`);
});

test("候補チップの補助ラベルは、返ってきた note をそのまま描く", () => {
  // 補助ラベルが落ちると、本文が「ずらせ」しか言わない前提が静かに崩れ、
  // 目で読む人と読み上げの人が別の助言を受け取る。
  const plantings = [{ cropId: "tomato", year: 2026 }];
  const html = render(plantings, { currentYear: 2026, currentMonth: 4 });
  const p = panelVerdicts({
    plantings,
    month: 4,
    currentYear: 2026,
    formCropId: "",
    formYear: "",
    cropLookup: cropById,
    crops: CROPS,
  });
  const notes = [
    ...p.groups.now,
    ...p.groups.caution,
    ...p.groups.avoid,
    ...p.groups.soon,
  ]
    .map((c) => c.note)
    .filter(Boolean);
  assert.ok(notes.length > 0, "前提: 補助ラベルを持つ候補が1件も無い");
  for (const note of notes) {
    assert.ok(
      html.includes(`<span class="plantnow-chip-note">${note}</span>`),
      `補助ラベルが描かれていない: ${note}`,
    );
  }
});

test("プレビューの但し書きは、枠ではなく科・適期の行に合流して描かれる", () => {
  // ソース文字列の出現回数だけで守っていたときは、出現回数を保ったまま描画を止める
  // 退行（`… !== null && false && (`）が全テストを素通りした。描画で固定する。
  const plantings = [
    { cropId: "not-a-crop", year: 2018 },
    { cropId: "tomato", year: 2026 },
  ];
  const html = render(plantings, { initialCropId: "tomato", initialYear: 2027 });
  const p = panelVerdicts({
    plantings,
    month: 9,
    currentYear: 2026,
    formCropId: "tomato",
    formYear: 2027,
    cropLookup: cropById,
    crops: CROPS,
  });
  assert.notEqual(p.undecidablePreviewNote, null, "前提: 短い変種が組み立てられていない");

  // 実際に描かれていること。
  assert.ok(
    html.includes(p.undecidablePreviewNote),
    `プレビューの但し書きが描かれていない: ${p.undecidablePreviewNote}`,
  );

  // 枠つきの Verdict に戻っていないこと（1パネルに同じ事実の枠が3つ並ぶ退行）。
  assert.ok(
    !verdicts(html).some((v) => v.text.includes(p.undecidablePreviewNote)),
    "但し書きが Verdict 枠として描かれている（.muted 行への合流が外れた）",
  );
});

test("作付けを作れるのは storage の makePlanting だけ", () => {
  // 年の正規化は makePlanting の中にある。コンポーネント側で作付けオブジェクトを
  // 直に組み立てられると、そこだけ正規化を通らない記録が生まれ、入力欄は丸めた年を
  // 表示するのに保存されるのは生値、という最も気づきにくい形で戻る。
  // このゲートは描画で踏めない（React のイベントを起こす手段を、依存を増やさずには持てない）ので、
  // 「作付けの id を作る手段が storage の外に無い」ことをソースで固定する。
  const files = [
    "app/components/PlannerApp.tsx",
    "app/components/BedEditor.tsx",
    "app/components/BedGrid.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      !/newId\(\s*["']p["']\s*\)/.test(src),
      `${f} が作付けの id を直に作っている。makePlanting を通すこと`,
    );
  }
  // 針の生存確認: 追加の経路が実際に makePlanting を呼んでいる。
  const planner = readFileSync("app/components/PlannerApp.tsx", "utf8");
  assert.match(
    planner,
    /makePlanting\(/,
    "追加の経路が makePlanting を通っていない",
  );
});
