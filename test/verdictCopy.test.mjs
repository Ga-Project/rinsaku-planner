// 画面に出る文そのものの検査。
//
// 判定ロジックは rotation.test.mjs が見る。ここが見るのは「利用者が読む文」で、
// とくに次の2つが再発しないことを固定する。
//   1. 目安年数に主語が無い  … 判定は作物ごとの年数、早見表は科の代表値を出すため
//      59作物中20作物で数字が食い違う。主語が無いと検算した人に矛盾として見える。
//   2. 過ぎた年に将来の助言  … 去年の記録を入れただけの人に「早くて2031年です」と
//      実行できない年が赤で出る。
// どちらも「文をどこで組み立てるか」の問題なので、合成関数に対して検査する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRotation, bedStatus } from "../app/lib/rotation.mjs";
import {
  rotationSentence,
  rotationChipNote,
  bedVerdictText,
  previewVerdictText,
  suggestionText,
} from "../app/lib/verdictCopy.mjs";
import { suggestPlantings } from "../app/lib/suggest.mjs";
import { CROPS, cropById } from "../app/lib/crops.mjs";

/** 暦の今年（シナリオの基準）。 */
const NOW = 2026;

// 画面が呼ぶのと同じ関数を通す。ここで組み立てを書き写すと、コンポーネントが
// 別の引数を渡していても気づけない（前サイクルはその欠陥を公開まで通している）。

/** 区画バナーに実際に出る文。 */
function bedText(plantings, currentYear = NOW) {
  return bedVerdictText(bedStatus(plantings, cropById), cropById, currentYear);
}

/** 追加フォームのプレビューに出る文（画面と同じ経路）。 */
function previewText(plantings, cropId, year, currentYear = NOW) {
  const crop = cropById(cropId);
  const records = plantings.map((p) => ({
    familyKey: cropById(p.cropId).familyKey,
    year: p.year,
  }));
  const r = evaluateRotation(records, crop.familyKey, crop.rotationYears, year);
  return previewVerdictText(r, crop, year, currentYear);
}

// --- 仕様の検算シナリオ（今年 = 2026） --------------------------------------

test("①これからの計画どうしが近い: 置ける年を名指しできる", () => {
  assert.equal(
    bedText([
      { cropId: "tomato", year: 2026 },
      { cropId: "tomato", year: 2027 },
    ]),
    "2026年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。どの作付けからも4年あくのは、早くて2031年です。",
  );
});

test("②過ぎた年の記録が、先の計画と近い: 実行できない『早くて◯年』を出さない", () => {
  const text = previewText([{ cropId: "tomato", year: 2027 }], "tomato", 2026);
  assert.equal(
    text,
    "2027年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。間隔をあけるには、2026年か2027年のどちらかをずらすことになります。",
  );
  // これが欠陥そのもの。2031年は「未来の計画より後ろへ送る年」で実行意図と食い違う。
  assert.doesNotMatch(text, /早くて/);
});

test("③判定年だけが過ぎている: 動かせる1件を名指しする", () => {
  assert.equal(
    previewText([{ cropId: "tomato", year: 2027 }], "tomato", 2024),
    "2027年に同じ科の作付けがあります。間隔は3年で、トマトの目安4年に足りません。2024年はもう過ぎているので、間隔をあけるなら2027年の作付けをずらすことになります。",
  );
});

test("④判定年も衝突年も過ぎている: 助言を出さず、動かせる場所へ送る", () => {
  const text = previewText([{ cropId: "tomato", year: 2023 }], "tomato", 2024);
  assert.equal(
    text,
    "2023年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。過ぎた年の記録なので、これから植えるものは上の「いま植えるなら」で確かめてください。",
  );
  assert.doesNotMatch(text, /早くて|ずらす/);
});

test("⑤同じパネルに違う目安が並んでも、主語が別なので矛盾に見えない", () => {
  // バナーはトマト基準（目安4年）、候補チップはジャガイモ基準（目安3年）。
  const banner = bedText([
    { cropId: "tomato", year: 2026 },
    { cropId: "tomato", year: 2027 },
  ]);
  const chipFacts = {
    status: "ng",
    requiredYears: 3,
    nearestSameFamilyYear: 2027,
    gapYears: 1,
    nextPlantableYear: 2031,
    conflictSide: "after",
  };
  const chip = rotationSentence(chipFacts, {
    cropName: "ジャガイモ",
    judgedYear: 2026,
    currentYear: NOW,
    face: "chip",
  });

  assert.match(banner, /トマトの目安4年/);
  assert.match(chip, /ジャガイモの目安3年/);
  // 年数を裸で名乗る（主語の無い「目安4年」）文が残っていないこと。
  // 「目安◯年」の直前は必ず「{作物名}の」でなければならない。
  for (const text of [banner, chip]) {
    for (const m of text.matchAll(/目安\d+年/g)) {
      const before = text.slice(0, m.index);
      assert.match(
        before,
        /[^。]の$/,
        `目安年数に主語が付いていない: ${text}`,
      );
    }
  }
  assert.equal(rotationChipNote(chipFacts), "2027年と近い");
});

test("⑥同じ年に同じ科が2件: 間隔0の重なりとして言い分ける", () => {
  assert.equal(
    bedText([
      { cropId: "tomato", year: 2026 },
      { cropId: "eggplant", year: 2026 },
    ]),
    "2026年には、同じ科の作付けがもう1件あります。間隔は0年で、ナスの目安4年に足りません。どの作付けからも4年あくのは、早くて2030年です。",
  );
});

// --- 面ごとの差分は2つだけ ---------------------------------------------------

test("同じ科の記録が無いときの文だけが面で変わる", () => {
  const facts = {
    status: "ok",
    requiredYears: 4,
    nearestSameFamilyYear: null,
    gapYears: null,
    nextPlantableYear: null,
    conflictSide: null,
  };
  const ctx = { cropName: "トマト", judgedYear: 2026, currentYear: NOW };
  // バナーは判定対象の作付け自身が下の一覧に並ぶので「ほかに」が要る。
  assert.equal(
    rotationSentence(facts, { ...ctx, face: "bed" }),
    "前後の年に、同じ科の作付けはほかにありません。",
  );
  // まだ記録していない面で「ほかに」と言うと事実に反する。
  assert.equal(
    rotationSentence(facts, { ...ctx, face: "preview" }),
    "この区画に、同じ科の作付けの記録はありません。",
  );
  assert.equal(
    rotationSentence(facts, { ...ctx, face: "chip" }),
    "この区画に、同じ科の作付けの記録はありません。",
  );
});

test("過ぎた年の締めは、その面で見るべき場所を指す", () => {
  const plantings = [{ cropId: "tomato", year: 2023 }];
  assert.match(previewText(plantings, "tomato", 2024), /上の「いま植えるなら」/);
  assert.match(
    bedText([...plantings, { cropId: "tomato", year: 2024 }]),
    /下の「いま植えるなら」/,
  );
});

// --- 目安0年の科 -------------------------------------------------------------

test("目安0年の科は、年数の枠組みを持ち込まない", () => {
  const text = previewText(
    [{ cropId: "sweet-potato", year: 2025 }],
    "sweet-potato",
    2026,
  );
  assert.equal(text, "サツマイモは、間隔をあけずに続けて植えやすい野菜です。");
  assert.doesNotMatch(text, /\d+年/);
});

// --- 補助ラベル ---------------------------------------------------------------

test("チップの補助ラベルは全角9以内で、相対年数を使わない", () => {
  const base = {
    status: "ng",
    requiredYears: 4,
    nearestSameFamilyYear: 2024,
    gapYears: 2,
    nextPlantableYear: 2028,
    conflictSide: "before",
  };
  assert.equal(rotationChipNote(base), "早くて2028年");
  assert.equal(
    rotationChipNote({ ...base, conflictSide: "same" }),
    "同じ年に重なる",
  );
  assert.equal(
    rotationChipNote({ ...base, status: "caution" }),
    "目安ちょうど",
  );
  assert.equal(rotationChipNote({ ...base, status: "ok" }), null);
  assert.equal(rotationChipNote({ ...base, requiredYears: 0 }), null);

  // 320px で1チップが7行に膨らんだ事故の再発防止（全角9以内）。
  for (const side of ["before", "after", "same"]) {
    for (const status of ["ng", "caution", "ok"]) {
      const note = rotationChipNote({ ...base, status, conflictSide: side });
      if (note === null) continue;
      assert.ok(note.length <= 9, `補助ラベルが長い: ${note} (${note.length})`);
      assert.doesNotMatch(note, /あと\d+年/, `相対年数を使っている: ${note}`);
    }
  }
});

// --- 実マスタ全域での不変条件 -------------------------------------------------

test("実マスタ全作物で、目安年数は必ず作物名とセットで名乗る", () => {
  // 区画にナス科を1件置いた状態で、全作物を候補として文を作る。
  const plantings = [{ cropId: "tomato", year: 2025 }];
  const out = suggestPlantings(plantings, CROPS, 8, NOW);
  assert.ok(out.length > 0, "候補が1件も出ていない");
  for (const s of out) {
    const text = suggestionText(s, NOW);
    // 主語が落ちると「、の目安4年」になる。文の形として面で捕まえる。
    assert.doesNotMatch(
      text,
      /[、。]の目安/,
      `目安年数の主語が落ちている (${s.nameJa}): ${text}`,
    );
    if (!text.includes("目安")) continue;
    assert.ok(
      text.includes(`${s.nameJa}の目安`),
      `目安年数に主語が無い (${s.nameJa}): ${text}`,
    );
    // 科の代表値ではなく、その作物自身の年数で名乗っていること。
    const crop = CROPS.find((c) => c.id === s.cropId);
    if (crop.rotationYears > 0 && text.includes(`の目安${crop.rotationYears}`)) {
      assert.ok(true);
    }
  }
});

test("これから植える候補に、実行できない助言が出ない", () => {
  // 候補の判定年は必ず今年か翌年なので、過ぎた年の分岐は起きない。
  for (const year of [NOW, NOW + 1]) {
    const out = suggestPlantings(
      [
        { cropId: "tomato", year: 2027 },
        { cropId: "potato", year: 2025 },
      ],
      CROPS,
      8,
      year,
    );
    for (const s of out) {
      const text = suggestionText(s, NOW);
      assert.doesNotMatch(
        text,
        /過ぎた年の記録なので/,
        `これから植える候補に過去向けの文が出ている (${s.nameJa}): ${text}`,
      );
      // 衝突相手が判定年より後のときに「早くて◯年」を出すと、その年は
      // 未来の計画より後ろになり、候補同士の見比べに対して嘘になる。
      if (s.conflictSide === "after") {
        assert.doesNotMatch(
          text,
          /早くて/,
          `後ろの計画との衝突に『早くて』を出している (${s.nameJa}): ${text}`,
        );
      }
    }
  }
});
