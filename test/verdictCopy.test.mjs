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
  panelVerdicts,
} from "../app/lib/verdictCopy.mjs";
import { suggestPlantings } from "../app/lib/suggest.mjs";
import { CROPS, FAMILIES, cropById } from "../app/lib/crops.mjs";

/** 暦の今年（シナリオの基準）。 */
const NOW = 2026;

// 画面が呼ぶのと同じ関数を通す。ここで組み立てを書き写すと、コンポーネントが
// 別の引数を渡していても気づけない（この製品はその欠陥を公開まで通している）。

/** 1区画ぶんの画面（バナー・候補チップ・プレビュー）をまとめて作る。 */
function panel(plantings, { currentYear = NOW, month = 5, cropId = "", year = "" } = {}) {
  return panelVerdicts({
    plantings,
    month,
    currentYear,
    formCropId: cropId,
    formYear: year,
    cropLookup: cropById,
    crops: CROPS,
  });
}

/** 区画バナーに実際に出る文。 */
function bedText(plantings, currentYear = NOW) {
  return panel(plantings, { currentYear }).banner?.text;
}

/** 追加フォームのプレビューに出る文。 */
function previewText(plantings, cropId, year, currentYear = NOW) {
  return panel(plantings, { currentYear, cropId, year }).preview?.text;
}

// --- 仕様の検算シナリオ（今年 = 2026） --------------------------------------

test("①待てば実行できるなら、置ける年を名指しする", () => {
  assert.equal(
    bedText([
      { cropId: "tomato", year: 2026 },
      { cropId: "tomato", year: 2027 },
    ]),
    "2026年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。いまある記録のままだと、どの作付けからも4年あくのは早くて2031年です。",
  );
});

test("①-b 判定年が過ぎていても、待てば実行できる年は名指しする", () => {
  // 過去の記録だからと年を伏せると「このうねでいつまた植えられるのか」に
  // 製品が答えなくなる。過ぎているかどうかは、年を名指しするかの条件ではない。
  assert.equal(
    bedText([
      { cropId: "tomato", year: 2024 },
      { cropId: "tomato", year: 2025 },
    ]),
    "2024年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。いまある記録のままだと、どの作付けからも4年あくのは早くて2029年です。",
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

test("④引けるレバーが1つも無い: 助言を出さず、答えが出る場所へ送る", () => {
  // 置ける年（2022年）も過ぎているので、待つ助言が成立しない。
  const text = previewText([{ cropId: "tomato", year: 2018 }], "tomato", 2019);
  assert.equal(
    text,
    "2018年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。どちらも過ぎた年のことなので、これから植えるものは上の「いま植えるなら」で確かめてください。",
  );
  assert.doesNotMatch(text, /早くて|ずらす/);
});

test("④-b チップ面は、動かせる記録のある場所を名指しする", () => {
  // チップの年は暦が決めるので動かせない。動かせるのは衝突年の記録だけ。
  const chips = allChips(panel([{ cropId: "tomato", year: 2027 }], { month: 5 }))
    .filter((c) => c.status === "ng" && c.conflictSide === "after");
  assert.ok(chips.length > 0, "after の ng 候補が出ていない");
  for (const c of chips) {
    assert.match(
      c.text,
      /間隔をあけるには、下の「作付けの記録」で2027年の作付けをずらすことになります。$/,
      `チップに実行できない助言が出ている: ${c.text}`,
    );
    // チップには年を動かす手段が無いので、判定年をずらせとは言わない。
    assert.doesNotMatch(c.text, /どちらかをずらす/);
  }
});

test("⑦記録できない年は名指ししない", () => {
  // 年の入力は 1900〜3000。置ける年が 3000 を超えるなら、その年は記録できない。
  const text = bedText([
    { cropId: "tomato", year: 2997 },
    { cropId: "tomato", year: 3000 },
  ]);
  assert.equal(
    text,
    "2997年に同じ科の作付けがあります。間隔は3年で、トマトの目安4年に足りません。3000年より後で、どの作付けからも4年あく年は、記録できる3000年より先になります。",
  );
  assert.doesNotMatch(text, /300[1-9]|3[1-9]\d\d/, "記録できない年を名指ししている");
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
  // 補助ラベルの軸は「空く年」1本。ふさいでいる年を混ぜると、チップ同士を
  // 年の数字で見比べたときに順序が反転して見える。
  assert.equal(rotationChipNote(chipFacts), "早くて2031年");
});

test("⑥同じ年に同じ科が2件: 間隔0の重なりとして言い分ける", () => {
  assert.equal(
    bedText([
      { cropId: "tomato", year: 2026 },
      { cropId: "eggplant", year: 2026 },
    ]),
    "2026年には、同じ科の作付けがもう1件あります。間隔は0年で、ナスの目安4年に足りません。いまある記録のままだと、どの作付けからも4年あくのは早くて2030年です。",
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

test("レバーが無いときの誘導先は、その面から見た場所を指す", () => {
  const plantings = [{ cropId: "tomato", year: 2018 }];
  assert.match(previewText(plantings, "tomato", 2019), /上の「いま植えるなら」/);
  assert.match(
    bedText([...plantings, { cropId: "tomato", year: 2019 }]),
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
  // side が違っても軸は変えない（順序の反転を防ぐ）。
  assert.equal(rotationChipNote({ ...base, conflictSide: "same" }), "早くて2028年");
  assert.equal(rotationChipNote({ ...base, conflictSide: "after" }), "早くて2028年");
  assert.equal(rotationChipNote({ ...base, status: "caution" }), "目安ちょうど");
  // 記録できない年は出さない。
  assert.equal(
    rotationChipNote({ ...base, nextPlantableYear: 3004 }),
    null,
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
      // 軸が混ざっていないこと（年を出すラベルは「早くて」だけ）。
      if (/\d{4}年/.test(note)) {
        assert.match(note, /^早くて\d{4}年$/, `補助ラベルの軸が混ざっている: ${note}`);
      }
    }
  }
});

// --- 実マスタ全域での不変条件 -------------------------------------------------

/** 4群すべてのチップを1本の配列にする。 */
function allChips(p) {
  return [...p.groups.now, ...p.groups.caution, ...p.groups.avoid, ...p.groups.soon];
}

test("実マスタ全作物で、目安年数は必ず作物名とセットで名乗る", () => {
  // ok / caution / ng の3分岐すべてを通す。同じ科の記録を年違いで置くと、
  // 候補ごとに間隔が変わって3分岐が揃う（ok だけ素通りしていた穴を塞ぐ）。
  const seen = new Set();
  for (const year of [2015, 2022, 2024, 2025]) {
    for (const month of [4, 8]) {
      const chips = allChips(panel([{ cropId: "tomato", year }], { month }));
      assert.ok(chips.length > 0, `候補が出ていない (${year}/${month})`);
      for (const c of chips) {
        seen.add(c.status);
        // 主語が落ちると「、の目安4年」になる。文の形として面で捕まえる。
        assert.doesNotMatch(
          c.text,
          /[、。]の目安/,
          `目安年数の主語が落ちている (${c.nameJa}): ${c.text}`,
        );
        if (!c.text.includes("目安")) continue;
        assert.ok(
          c.text.includes(`${c.nameJa}の目安`),
          `目安年数に主語が無い (${c.nameJa}): ${c.text}`,
        );
        // 科の代表値ではなく、その作物自身の年数で名乗っていること。
        const crop = CROPS.find((x) => x.id === c.cropId);
        const fam = FAMILIES.find((f) => f.key === crop.familyKey);
        if (crop.rotationYears > 0) {
          assert.ok(
            c.text.includes(`${c.nameJa}の目安${crop.rotationYears}年`) ||
              c.text.includes(`${c.nameJa}の目安ちょうど`),
            `作物自身の年数で名乗っていない (${c.nameJa}: 作物${crop.rotationYears}年 / 科${fam.rotationYears}年): ${c.text}`,
          );
        }
      }
    }
  }
  // 3分岐すべてを実際に通したことを確かめる（通っていなければ検査が空回り）。
  for (const st of ["ok", "caution", "ng"]) {
    assert.ok(seen.has(st), `${st} 分岐を1件も通っていない`);
  }
});

test("ok 分岐でも、目安年数は作物名とセットで名乗る", () => {
  // 「をこえています」の文（ok）を必ず1件は踏む。
  const chips = allChips(panel([{ cropId: "tomato", year: 2015 }], { month: 8 }));
  const oks = chips.filter((c) => c.text.includes("をこえています"));
  assert.ok(oks.length > 0, "ok 分岐の文が1件も出ていない");
  for (const c of oks) {
    assert.match(c.text, new RegExp(`${c.nameJa}の目安\\d+年をこえています`));
  }
});

test("これから植える候補に、実行できない助言が出ない", () => {
  // 候補の判定年は必ず今年か翌年なので、過ぎた年の分岐は起きない。
  for (const month of [4, 8, 12]) {
    const chips = allChips(
      panel(
        [
          { cropId: "tomato", year: 2027 },
          { cropId: "potato", year: 2025 },
        ],
        { month },
      ),
    );
    for (const c of chips) {
      assert.doesNotMatch(
        c.text,
        /過ぎた年の記録なので/,
        `これから植える候補に過去向けの文が出ている (${c.nameJa}): ${c.text}`,
      );
    }
  }
});
