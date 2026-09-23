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
import { MIN_YEAR, MAX_YEAR } from "../app/lib/storage.mjs";
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
    "この2027年のトマトから見ると、2026年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。いまある記録のままだと、2027年より後で、どの作付けからも4年あくのは早くて2031年です。",
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
    "この2025年のトマトから見ると、2024年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。いまある記録のままだと、2025年より後で、どの作付けからも4年あくのは早くて2029年です。",
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
    "2018年に同じ科の作付けがあります。間隔は1年で、トマトの目安4年に足りません。2019年も2018年ももう過ぎているので、これから植えるものは上の「いま植えるなら」で確かめてください。",
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
      /間隔をあけるには、下の「作付けの記録」で2027年の作付けをずらすか、\d{4}年まで待つことになります。$/,
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
    "この3000年のトマトから見ると、2997年に同じ科の作付けがあります。間隔は3年で、トマトの目安4年に足りません。3000年より後で、どの作付けからも4年あく年は、記録できる3000年より先になります。",
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
    "2026年には、同じ科の作付けがほかにもあります。間隔があかないので、ナスの目安4年に足りません。いまある記録のままだと、2026年より後で、どの作付けからも4年あくのは早くて2030年です。",
  );
});

// --- 面ごとの差分は2つだけ ---------------------------------------------------

test("同じ科の記録が無いときの文は、面ごとに前提が違う", () => {
  const facts = {
    status: "ok",
    requiredYears: 4,
    nearestSameFamilyYear: null,
    gapYears: null,
    nextPlantableYear: null,
    conflictSide: null,
  };
  const ctx = { cropName: "トマト", judgedYear: 2026, currentYear: NOW };
  // まだ記録していない面で「記録はありません」と言うのは真。
  assert.equal(
    rotationSentence(facts, { ...ctx, face: "preview" }),
    "この区画に、同じ科の作付けの記録はありません。",
  );
  assert.equal(
    rotationSentence(facts, { ...ctx, face: "chip" }),
    "この区画に、同じ科の作付けの記録はありません。",
  );
  // バナーは判定対象自身を外して数えるので、この文を出してはいけない。
  // 同科が判定対象1件だけのときは、その1件を科ごと名指しする専用の文になる。
  assert.equal(
    rotationSentence(facts, {
      ...ctx,
      face: "bed",
      sameFamilyCount: 1,
      familyJa: "ナス科",
    }),
    "ナス科の記録はこの2026年のトマトだけなので、連作にはなっていません。",
  );
  // bed 面で同科が無い状態には構造上到達しない（下の総当たりで固定している）。
  // 万一到達しても、無言の空文字にも例外（＝静的公開物では白画面）にもせず、
  // 正直な非空文を返すこと。
  const fallback = rotationSentence(facts, {
    ...ctx,
    face: "bed",
    sameFamilyCount: 2,
  });
  assert.ok(fallback.length > 0, "空文字を返している");
  assert.match(fallback, /判定を出せませんでした/);
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
  // ⚠️ 文面リテラルで「出ていないこと」を検査すると、文面を改名した瞬間に
  // 針がどこにも一致しなくなり、検査が静かに空振りする（実際に一度そうなった）。
  // ここでは (a) 針が生きていることを先に確かめ、(b) 構造の不変条件も併せて見る。
  const pastAdvice = previewText(
    [{ cropId: "tomato", year: 2018 }],
    "tomato",
    2019,
  );
  assert.match(
    pastAdvice,
    /もう過ぎているので/,
    "針が現行の文面と一致していない（この検査は空振りしている）",
  );

  // 12月は作物マスタ上、今月も翌月も適期の作物が無く候補0件になる（正常）。
  // 「どこかの月では候補が出ている」ことだけ担保して、空の月は素通りさせる。
  let sawChips = false;
  for (const month of [4, 8, 12]) {
    const p = panel(
      [
        { cropId: "tomato", year: 2027 },
        { cropId: "potato", year: 2025 },
      ],
      { month },
    );
    const chips = allChips(p);
    if (chips.length > 0) sawChips = true;
    for (const c of chips) {
      // (a) 文面による検査。
      assert.doesNotMatch(
        c.text,
        /もう過ぎているので/,
        `これから植える候補に過去向けの文が出ている (${c.nameJa}): ${c.text}`,
      );
      // (b) 構造による検査。候補の判定年は必ず今年以降で、これが崩れない限り
      //     過去向けの分岐には入らない。文面を改名しても空振りしない。
      assert.ok(
        c.targetYear >= NOW,
        `候補の判定年が過去になっている (${c.nameJa}: ${c.targetYear})`,
      );
    }
  }
  assert.ok(sawChips, "どの月でも候補が1件も出ていない");
});


// --- パネル単位の不変条件（面ごとの文では担保できない） -----------------------
//
// バナーだけが判定対象の作付けを履歴から外して数えるので、区画全体について
// 全称的に語ると、同じ記録を数に入れる候補チップと真っ向から食い違う。
// 面ごとの文を個別に見るテストではこの組み合わせを捕まえられない（実際に
// 11,800パネルぶんの矛盾が、全ゲート緑のまま公開まで通っていた）。

/** 区画の配置を総当たりして、パネル単位で検査する。 */
function forEachPanel(fn) {
  const ids = CROPS.slice(0, 14).map((c) => c.id);
  let count = 0;
  for (const y0 of [2020, 2024, 2026, 2027]) {
    for (const y1 of [2024, 2026, 2027]) {
      for (const a of ids) {
        for (const b of ids) {
          for (const month of [4, 9]) {
            const plantings = [{ cropId: a, year: y0 }];
            if (!(a === b && y0 === y1)) plantings.push({ cropId: b, year: y1 });
            const p = panel(plantings, { month });
            if (p.banner === null) continue;
            count++;
            fn(p, plantings);
          }
        }
      }
    }
  }
  assert.ok(count > 1000, `総当たりの規模が小さすぎる: ${count}`);
  return count;
}

test("バナーが名指しできる同科が無い状態でも、チップと食い違わない", () => {
  // ⚠️ ゲートを文面の針（/ありません/ 等）で書くと、文面を別の言い方に変えた
  //    瞬間に1件も到達しなくなり、検査が静かに空振りする。入口は構造で書く。
  let reached = 0;
  forEachPanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    // バナーは判定対象自身を履歴から外すので、同科がその1件だけだと名指しできる
    // 年が無くなる。チップは同じ記録を数えるので、ここが食い違いの発生点。
    if (bed.nearestSameFamilyYear !== null) return;
    reached++;

    // バナーはその1件を年で名乗る（不在を断定しない）。
    assert.match(
      p.banner.text,
      new RegExp(`${bed.latestYear}年`),
      `バナーが判定対象の年を名乗っていない: ${p.banner.text}`,
    );

    // 同じ科のチップが名指しする年は、その1件以外にありえない。
    for (const c of allChips(p)) {
      if (c.familyKey !== bed.familyKey) continue;
      if (c.nearestSameFamilyYear === null) continue;
      assert.equal(
        c.nearestSameFamilyYear,
        bed.latestYear,
        `チップがバナーの知らない年を名指ししている: ${c.text}`,
      );
    }
  });
  assert.ok(reached > 100, `検査に到達したパネルが少なすぎる: ${reached}`);
});

test("バナーは必ず、どの作付けから見た話かを年で名乗る", () => {
  // ⚠️ ここを「ほかにありません／もう1件を含まない」という文面の針で書いていた。
  //    それは旧コピーが使っていた語そのものなので、別の言い方に書き換えれば
  //    必ず空振りする（区画全体についての全称的な断定が全ゲートを通った）。
  //    見たいのは語の不在ではなく「基準点を名乗っているか」なので、事実側で書く。
  //    基準点を保ったままの言い換え（「この2026年のトマトのほかに…ありません」）は
  //    欠陥ではないので、この検査は正しく通す。
  let reached = 0;
  forEachPanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    reached++;
    assert.match(
      p.banner.text,
      new RegExp(`${bed.latestYear}年`),
      `バナーが判定対象の年を名乗っていない: ${p.banner.text}`,
    );
  });
  assert.ok(reached > 1000, `検査に到達したパネルが少なすぎる: ${reached}`);
});

test("同じ科が2件以上あるバナーは、どの作付けから見た間隔かを名乗る", () => {
  // ゲートは事実側で書く。文面（「間隔は」等）を針にすると、言い回しを変えた
  // ついでに基準点を落とす変更で空振りする。
  let reached = 0;
  forEachPanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    if (bed.sameFamilyCount < 2) return;
    // 同年重複は両面とも間隔0で一致するので、基準点を名乗る必要がない。
    if (bed.conflictSide === "same") return;
    reached++;
    assert.match(
      p.banner.text,
      new RegExp(`^この${bed.latestYear}年の.+から見ると、`),
      `基準点を名乗らずに間隔を述べている: ${p.banner.text}`,
    );
  });
  assert.ok(reached > 100, `検査に到達したパネルが少なすぎる: ${reached}`);
});

test("バナーで同じ科の記録が無いのは、判定対象1件だけの区画に限る", () => {
  // 除外規則が変わったときに気づけるようにする（設計上の前提の明示）。
  forEachPanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    if (bed.nearestSameFamilyYear !== null) return;
    assert.equal(
      bed.sameFamilyCount,
      1,
      `同科が無いのに件数が1でない: ${JSON.stringify(plantings)}`,
    );
  });
});

// --- 判定に入れられない記録（作物が一覧に無い） -------------------------------
//
// 作物マスタから作物が消えると、その記録は **古い年** にあるのが自然。ところが
// 判定不能の検知を「最新の作付けが未知か」で書いていたため、古い年に混ざった
// 未知の記録は3つの経路（bedStatus の履歴・候補生成・プレビュー）で無言に捨てられ、
// 画面は同じパネルにその行が見えている状態で「記録はありません」と断定していた。
// 最新かどうかに依らないことを、非最新の位置に差し込んだ総当たりで固定する。

/** 未知 cropId を色々な位置に差し込んだ区画を総当たりする。 */
function forEachUndecidablePanel(fn) {
  // ⚠️ 目安0年の作物を必ず含める。連作の縛りが無い科は、判定に入れられない記録が
  //    あっても結論が変わらないので、扱いが他と違う。ここが抜けていたため、
  //    「目安0年でも判定できませんと名乗る」誤りを素通りさせた。
  const ids = [
    ...CROPS.slice(0, 6).map((c) => c.id),
    "corn",
    "sweet-potato",
    "mint",
  ];
  let count = 0;
  for (const unknownYear of [2018, 2024, 2026, 2030]) {
    for (const knownYear of [2020, 2026, 2028]) {
      for (const known of ids) {
        for (const month of [4, 9]) {
          const plantings = [
            { cropId: "not-a-crop", year: unknownYear },
            { cropId: known, year: knownYear },
          ];
          count++;
          fn(panel(plantings, { month }), plantings);
        }
      }
    }
  }
  assert.ok(count > 100, `総当たりの規模が小さすぎる: ${count}`);
  return count;
}

/**
 * 「判定に入れられない記録がある」ことを常に画面へ出している面をすべて集める。
 *
 * 群の上の1文（undecidableNotice）だけを見ると、最新作付けの作物が一覧に無い区画で
 * unknownCropText が同じ年を名指ししているのに「但し書きが無い」と判定してしまう。
 * 逆にどれか1つでも出ていればよいのではなく、**年が1つ残らず名乗られていること**を
 * 見る（畳んだ側に年が落ちると、その記録はどの面にも出なくなる）。
 * プレビューの短句は作物を選んだときしか描かれないので、ここには含めない。
 */
const alwaysVisibleDisclosures = (p) =>
  [p.undecidableNotice, p.unknownCropText].filter(Boolean);

test("判定に入れられない記録は、最新でなくても但し書きが出る", () => {
  let reached = 0;
  forEachUndecidablePanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    if (bed.undecidableYears.length === 0) return;
    reached++;
    const shown = alwaysVisibleDisclosures(p);
    assert.ok(
      shown.length > 0,
      `判定に入れていない記録があるのに但し書きが無い: ${JSON.stringify(plantings)}`,
    );
    for (const y of bed.undecidableYears) {
      assert.ok(
        shown.some((t) => t.includes(String(y))),
        `${y} 年の記録に触れている面が1つも無い: ${JSON.stringify(plantings)}`,
      );
    }
  });
  assert.ok(reached > 100, `検査に到達したパネルが少なすぎる: ${reached}`);
});

test("但し書きが無いまま「記録はありません」と断定する面が無い", () => {
  let reached = 0;
  forEachUndecidablePanel((p) => {
    const texts = [
      ...allChips(p).map((c) => c.text),
      p.preview?.text,
      p.banner?.text,
    ].filter(Boolean);
    const denials = texts.filter((t) => t.includes("記録はありません"));
    if (denials.length === 0) return;
    reached++;
    assert.ok(
      alwaysVisibleDisclosures(p).length > 0,
      `但し書き無しで不在を断定している: ${denials[0]}`,
    );
  });
  assert.ok(reached > 50, `検査に到達したパネルが少なすぎる: ${reached}`);
});

test("判定に入れられない記録がある区画は、植え付けOKを名乗らない", () => {
  // 判定に入れられない記録は、判定を良くすることはなく悪くすることしかできない
  // （同じ科なら最も近い同科の年は近づくだけ）。だから:
  //   ok   … 安全の主張なので成立しない → unknown
  //   caution / ng … 既知の違反は本物なので残す（警告を消すほうが危険）
  //   目安0年の科 … 未知の記録が何であっても結論が変わらないので ok のまま
  let sawZero = 0;
  let sawDowngrade = 0;
  forEachUndecidablePanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    if (bed.undecidableYears.length === 0) return;
    if (bed.unknownCrop) {
      assert.equal(p.badgeStatus, "unknown", JSON.stringify(plantings));
    } else if (bed.requiredYears <= 0) {
      sawZero++;
      assert.equal(p.badgeStatus, bed.status, JSON.stringify(plantings));
    } else if (bed.status === "ok") {
      sawDowngrade++;
      // 判定は出ているので「判定できず」ではない。数え切れていないことだけを言う。
      assert.equal(p.badgeStatus, "partial", JSON.stringify(plantings));
    } else {
      assert.equal(p.badgeStatus, bed.status, JSON.stringify(plantings));
    }
  });
  assert.ok(sawZero > 0, "目安0年の科を1件も通っていない");
  assert.ok(sawDowngrade > 0, "ok から落とす配置を1件も通っていない");
});

test("バッジとバナーは、同じ区画に同じ状態を出す", () => {
  // 上下に並ぶ2つの符号が別の状態を名乗ると、どちらを信じればよいか分からない。
  // 導出が2箇所にあったせいで実際に割れたので、一致そのものを固定する。
  let reached = 0;
  const check = (p) => {
    if (p.banner === null) return;
    reached++;
    assert.equal(p.badgeStatus, p.banner.status);
  };
  forEachPanel(check);
  forEachUndecidablePanel(check);
  assert.ok(reached > 1000, `検査に到達したパネルが少なすぎる: ${reached}`);
});

test("安全を主張する文にだけ、言い切れない旨を添える", () => {
  forEachUndecidablePanel((p, plantings) => {
    const bed = bedStatus(plantings, cropById);
    if (bed.undecidableYears.length === 0 || bed.unknownCrop) return;
    const t = p.banner.text;
    if (bed.requiredYears <= 0) return;
    if (bed.status === "ok") {
      assert.match(t, /言い切れません。$/, t);
    } else if (bed.status === "caution") {
      assert.match(t, /間隔はこれより短いかもしれません。$/, t);
    } else {
      // ng の結論は覆らない。文を足さず、年を名指しする締めの前置きだけを直す。
      assert.doesNotMatch(t, /言い切れません|短いかもしれません/, t);
      // 「早くて◯年」の締めはこの総当たり（既知の作付けが1件）では ng にならず
      // 一度も出ない。到達件数を数えて確かめたところ 0 だったので、条件付きの
      // assert をここに置いても永久に走らない。専用のテストへ移した（下記）。
    }
  });
});

test("判定に入れられない記録がある区画の「早くて◯年」は、数え落としを前置きする", () => {
  // 上の総当たりでは ng に到達しないため、既知の同じ科を2件置いて明示的に作る。
  // 前置きが落ちると、判定に入れていない記録があるのに「いまある記録のままだと」と
  // 断定してしまい、名指しした年が全ての記録を踏まえたものだと読める。
  let reached = 0;
  for (const [a, b] of [
    [2024, 2026],
    [2025, 2026],
    [2023, 2026],
  ]) {
    const plantings = [
      { cropId: "not-a-crop", year: 2018 },
      { cropId: "tomato", year: a },
      { cropId: "tomato", year: b },
    ];
    const bed = bedStatus(plantings, cropById);
    assert.equal(bed.status, "ng", `前提: ng になっていない (${a},${b})`);
    assert.ok(bed.undecidableYears.length > 0, "前提: 未判定の記録が無い");

    const p = panel(plantings, { currentYear: 2026 });
    if (!/早くて\d{4}年です。/.test(p.banner.text)) continue;
    reached++;
    assert.match(
      p.banner.text,
      /いまある記録のうち判定に入れたぶんでは/,
      `数え落としの前置きが無い: ${p.banner.text}`,
    );
    assert.ok(
      !p.banner.text.includes("いまある記録のままだと"),
      `全件を踏まえたかのように断定している: ${p.banner.text}`,
    );
  }
  assert.ok(reached > 0, "「早くて◯年」の締めに一度も到達していない（針が死んでいる）");
});

test("但し書きは件数に合わせて単複を言い分ける", () => {
  const one = panel([
    { cropId: "not-a-crop", year: 2020 },
    { cropId: "tomato", year: 2026 },
  ]);
  assert.match(one.undecidableNotice, /2020年の記録があります。/);
  assert.match(one.undecidableNotice, /この記録は判定に入れていません。$/);

  const many = panel([
    { cropId: "not-a-crop", year: 2015 },
    { cropId: "also-not", year: 2019 },
    { cropId: "nor-this", year: 2022 },
    { cropId: "tomato", year: 2026 },
  ]);
  // 3件あるのに「この記録は」と単数で言わない。
  assert.match(many.undecidableNotice, /記録が3件（2015・2019・2022年）あります。/);
  assert.match(many.undecidableNotice, /これらは判定に入れていません。$/);
  assert.doesNotMatch(many.undecidableNotice, /この記録は/);
});

test("プレビューの但し書きは、候補群と同じ文を並べない", () => {
  const p = panel([
    { cropId: "not-a-crop", year: 2020 },
    { cropId: "tomato", year: 2026 },
  ]);
  assert.notEqual(p.undecidableNotice, null);
  assert.notEqual(p.undecidablePreviewNote, null);
  // 320px で画面1枚ぶんが同じ注意書きになるのを避ける。
  assert.notEqual(
    p.undecidableNotice,
    p.undecidablePreviewNote,
    "同じ文を2枠に並べている",
  );
  assert.ok(
    p.undecidablePreviewNote.length < p.undecidableNotice.length,
    "プレビュー側が短くなっていない",
  );
});

// ---------------------------------------------------------------------------
// 年入力の正規化（入力境界）
// ---------------------------------------------------------------------------

test("年欄に整数でない値・範囲外の値を入れても、プレビューが記録の不在を断定しない", () => {
  // 入力欄の min/max は入力を止めない。2026.5 や 20226 がそのまま判定年になると
  // 「同じ科の作付けの記録はありません」に落ち、同じパネルの3行下に並ぶその記録を
  // 利用者が反証できる状態になる（さらにリロード時の丸めで判定が黙って反転する）。
  const plantings = [
    { cropId: "tomato", year: 2025 },
    { cropId: "eggplant", year: 2024 },
  ];
  const bad = [2026.5, 20226, -5, 0, 1899.9, 3000.7, NaN, Infinity, "2026", null];
  let reached = 0;
  for (const formYear of bad) {
    const p = panel(plantings, { cropId: "tomato", year: formYear });
    assert.notEqual(p.preview, null, `プレビューが出ていない: ${String(formYear)}`);
    reached++;

    // 判定年は「実際に記録される値」でなければならない。
    assert.ok(
      Number.isInteger(p.preview.targetYear),
      `判定年が整数でない: ${String(formYear)} → ${p.preview.targetYear}`,
    );
    assert.ok(
      p.preview.targetYear >= MIN_YEAR && p.preview.targetYear <= MAX_YEAR,
      `判定年が記録できる範囲の外: ${String(formYear)} → ${p.preview.targetYear}`,
    );

    // 同じ科の記録が実在するのに不在を断定しない。
    assert.ok(
      !p.preview.text.includes("記録はありません"),
      `同じ科の記録があるのに不在を断定した (${String(formYear)}): ${p.preview.text}`,
    );

    // 記録できない年を名指ししない（本モジュール自身の規則）。
    // 暦年は4桁以上。「目安4年」「間隔は1年」は期間なので拾わない。
    for (const m of p.preview.text.matchAll(/(\d{4,})年/g)) {
      const y = Number(m[1]);
      assert.ok(
        y >= MIN_YEAR && y <= MAX_YEAR,
        `記録できない年を名指しした (${String(formYear)}): ${p.preview.text}`,
      );
    }
  }
  assert.ok(reached === bad.length, `検査に到達しなかった入力がある: ${reached}`);
});

// ---------------------------------------------------------------------------
// 「早くて◯年」の射程
// ---------------------------------------------------------------------------

test("「早くて◯年」は、その射程の中で本当に最も早い年である", () => {
  // findNextPlantableYear は **判定年を起点に** 探すので、判定年より前に空いている
  // 年があっても名指ししない。射程を言わずに書くと、同じ科の記録がすべて判定年より
  // 後にある区画で「今年すでに植えられる」のに1シーズン以上つぶす助言になる。
  //
  // ここでは実装の探索を使わず、記録から独立に「置ける年」を数え直して検算する。
  const plantable = (years, req, y) => years.every((r) => Math.abs(y - r) >= req);

  let reached = 0;
  for (const [a, b] of [
    [2027, 2027],
    [2028, 2029],
    [2030, 2030],
    [2027, 2031],
    [2026, 2026],
    [2024, 2026],
    [2020, 2028],
  ]) {
    for (const currentYear of [2026, 2027, 2028]) {
      const plantings = [
        { cropId: "komatsuna", year: a },
        { cropId: "komatsuna", year: b },
      ];
      const p = panel(plantings, { currentYear });
      if (p.banner === null) continue;
      const m = p.banner.text.match(/早くて(\d+)年/);
      if (!m) continue;
      reached++;
      const named = Number(m[1]);

      const info = cropById("komatsuna");
      const req = info.rotationYears;
      const years = [a, b];
      const judged = Math.max(a, b); // バナーの判定年＝最新作付けの年

      // 文が射程を名乗っていること。名乗らないなら、判定年より前に置ける年が
      // 1つも無いことまで保証されていなければ嘘になる。
      const scoped = p.banner.text.includes(`${judged}年より後で`);
      if (!scoped) {
        for (let y = MIN_YEAR; y < named; y++) {
          assert.ok(
            !plantable(years, req, y),
            `射程を名乗らずに「早くて${named}年」と書いたが、${y}年に置ける: ${p.banner.text}`,
          );
        }
      }

      // 名乗った射程の中では、本当に最も早い年であること。
      for (let y = judged + 1; y < named; y++) {
        assert.ok(
          !plantable(years, req, y),
          `${y}年に置けるのに「早くて${named}年」と書いている: ${p.banner.text}`,
        );
      }
      assert.ok(
        plantable(years, req, named),
        `名指しした${named}年に実は置けない: ${p.banner.text}`,
      );
    }
  }
  assert.ok(reached > 5, `「早くて◯年」に到達した配置が少なすぎる: ${reached}`);
});

test("判定に入れられない記録が2件以上あるとき、どの年も名乗られずに消えない", () => {
  // 最新作付けの作物が一覧に無い区画では、群の上の1文を畳んで重複を減らしている。
  // ただし畳んでよいのは、すぐ上の unknownCropText が名乗る「最新の1年」だけで
  // 事足りるときに限る。2件以上あるのに畳むと、残りの年はどの面にも出なくなる
  // （総当たりのフィクスチャは未知の記録を1件しか作らないので、この配置は
  //  そちらの検査では踏めない）。
  let reached = 0;
  for (const [older, newer] of [
    [2018, 2030],
    [2019, 2026],
    [2005, 2031],
  ]) {
    const plantings = [
      { cropId: "not-a-crop", year: older },
      { cropId: "also-not-a-crop", year: newer },
    ];
    const bed = bedStatus(plantings, cropById);
    assert.equal(bed.unknownCrop, true, "前提: 最新作付けが未知でない");
    assert.equal(bed.undecidableYears.length, 2, "前提: 未知の記録が2件でない");
    reached++;

    const p = panel(plantings);
    const shown = alwaysVisibleDisclosures(p);
    for (const y of bed.undecidableYears) {
      assert.ok(
        shown.some((t) => t.includes(String(y))),
        `${y} 年の記録に触れている面が1つも無い: ${JSON.stringify(plantings)} / 出ている文=${JSON.stringify(shown)}`,
      );
    }
  }
  assert.ok(reached === 3, `検査に到達した配置が少ない: ${reached}`);
});
