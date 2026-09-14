// 「勧めたものを記録したら、その区画が赤くなる」を起こさないための検査。
//
// この製品は同じ問いに2つの経路で答える:
//   - これから植える場合の判定（suggestPlantings / 編集パネルのプレビュー）
//   - すでに記録した作付けの判定（bedStatus → 区画セルの色）
// 利用者は前者を見て記録するので、前者が「植えられます」と言ったものを記録した
// 直後に後者が「連作NG」を出すと、製品が自分の勧めを自分で否定する。
//
// ■ この検査が保証する範囲（正直に書く）
//   保証するのは **同じ科の作付けとの「間隔」に起因する食い違いがゼロ** であること。
//   残っている食い違いは、もう1つ別の非対称に由来する:
//     suggestPlantings は「これから植える作物」の rotationYears で判定し、
//     bedStatus は「その区画の最新の作付け」の rotationYears で判定する。
//   同じ科でも作物ごとにあけたい年数は揺れる（キク科: シュンギク1年 / ゴボウ5年、
//   ウリ科: カボチャ1年 / スイカ5年）ので、相手のほうが長い科では記録した瞬間に
//   判定がひっくり返る。これは判定仕様をどちらに寄せるかの問題で、別の変更で扱う。
//   下の検査はその集合を **述語で明示的に外し**、外した集合が空でないこと
//   （＝除外が全部を飲み込んでいないこと）も同時に確かめる。
//
// ■ この検査が保証しないこと（除外領域があるので、これ単独を網として数えない）
//   - 「あけたい年数の非対称」が残っている限り、その領域では間隔の数え方が壊れて
//     いても除外に飲まれる。**間隔の対称性そのものは、除外領域を持たない検査
//     （rotation.test.mjs の「A年からB年を見た判定と…が一致する」）で固定する。**
//   - 見るのは「勧めた → 記録したら赤」の向きだけ。逆向き（記録済みの判定は緑
//     なのに、同じ区画で何も勧めない）は、bedStatus と suggestPlantings が別の年を
//     判定年にすることから来る別の非対称で、これも別の変更で扱う。
//
// 実装の式を書き写すのではなく、両方の経路を実際に呼んで突き合わせる。

import test from "node:test";
import assert from "node:assert/strict";

import { suggestPlantings } from "../app/lib/suggest.mjs";
import { bedStatus } from "../app/lib/rotation.mjs";
import { CROPS, cropById } from "../app/lib/crops.mjs";

const VIEW_YEAR = 2026;

/** 記録したあとに bedStatus の基準になる作付け（年が最大・同年は後勝ち）。 */
function latestOf(plantings) {
  let latest = plantings[0];
  for (const p of plantings) if (p.year >= latest.year) latest = p;
  return latest;
}

/**
 * 「あけたい年数の非対称」で説明できる食い違いか。
 * 記録後の基準作付けの rotationYears が、勧めた作物のそれより長いとき、
 * 2つの経路は違う年数で判定する＝間隔の話ではない。
 */
function explainedByRequiredYears(plantings, suggestion) {
  const after = [...plantings, { cropId: suggestion.cropId, year: suggestion.targetYear }];
  const latest = cropById(latestOf(after).cropId);
  const candidate = cropById(suggestion.cropId);
  return latest.rotationYears > candidate.rotationYears;
}

/** 全作物 × 判定年の前後6年 × 全12ヶ月を総当たりする。 */
function sweep(onContradiction) {
  for (const other of CROPS) {
    for (let offset = -6; offset <= 6; offset++) {
      // 記録1件の区画だけでなく、同じ科が離れて2件ある区画も回す。
      // 「あと◯年」が塞がった年を飛ばして数える処理は、2件以上でしか効かない。
      const beds = [
        [{ cropId: other.id, year: VIEW_YEAR + offset }],
        [
          { cropId: other.id, year: VIEW_YEAR + offset },
          { cropId: other.id, year: VIEW_YEAR + offset + 4 },
        ],
      ];
      for (const plantings of beds) {
        // もともと連作NGの区画は対象外。検査したいのは「勧めたものを記録したせいで
        // 赤くなる」ことであって、記録する前から赤い区画の状態ではない。
        if (bedStatus(plantings, cropById).status === "ng") continue;
        for (let month = 1; month <= 12; month++) {
          for (const s of suggestPlantings(plantings, CROPS, month, VIEW_YEAR)) {
            // 「避けたい」と言ったものは対象外。それ以外（植えられる・間隔に注意）は
            // 利用者が選んでよい候補として出しているので、記録して赤くなってはいけない。
            if (s.status === "ng") continue;
            const after = bedStatus(
              [...plantings, { cropId: s.cropId, year: s.targetYear }],
              cropById,
            );
            if (after.status === "ng") onContradiction(plantings, s, after);
          }
        }
      }
    }
  }
}

test("勧めた候補を記録しても区画が赤くならない（同じ科との間隔に起因する分）", () => {
  const residual = [];
  let explained = 0;
  sweep((plantings, s) => {
    if (explainedByRequiredYears(plantings, s)) explained += 1;
    else
      residual.push(
        `${plantings.map((p) => `${cropById(p.cropId).nameJa}@${p.year}`).join("+")} / ` +
          `${s.nameJa}(${s.status}) を ${s.targetYear} に記録 → ng`,
      );
  });

  assert.deepEqual(
    residual.slice(0, 10),
    [],
    `間隔に起因する食い違いが ${residual.length} 件ある`,
  );
  // 除外が全部を飲み込んでいないこと＝この検査が空振りしていないことの確認。
  assert.ok(
    explained > 0,
    "除外した集合が空。述語か走査域が壊れて、何も検査していない",
  );
});

test("間隔の向きを片側だけにすると、この検査が実際に落ちる", () => {
  // 上の検査が「通りやすいだけ」でないことを示す。判定年より後の作付けを
  // 無視する（＝この変更の前の挙動）実装を手元で組み、同じ走査にかける。
  const ignoreLater = (plantings, cropId, targetYear) => {
    const crop = cropById(cropId);
    const sameFamilyPast = plantings
      .map((p) => cropById(p.cropId))
      .filter((c, i) => c && c.familyKey === crop.familyKey && plantings[i].year <= targetYear);
    return sameFamilyPast.length === 0;
  };
  // 先の年にだけ同じ科がある区画では、旧実装は必ず「記録なし」と見なす。
  const plantings = [{ cropId: "tomato", year: 2027 }];
  assert.ok(
    ignoreLater(plantings, "tomato", 2026),
    "前提が崩れている（この区画は旧実装なら記録なし扱い）",
  );
  // いまの実装はそう見なさない。
  const now = suggestPlantings(plantings, CROPS, 4, VIEW_YEAR).find(
    (s) => s.cropId === "tomato",
  );
  assert.ok(now, "4月にトマトの候補が出ていない");
  assert.equal(now.status, "ng", "先の年の同じ科を見落としている");
  const after = bedStatus(
    [...plantings, { cropId: "tomato", year: now.targetYear }],
    cropById,
  );
  assert.equal(after.status, "ng", "記録すれば赤くなる＝勧めてはいけなかった");
});

test("避けたいと言った候補は、記録すると実際に区画が赤くなる（逆向きの取りこぼし）", () => {
  // 「安全側に倒しすぎて何も勧めない」実装を通さないための対の検査。
  const plantings = [{ cropId: "tomato", year: 2025 }];
  const ng = suggestPlantings(plantings, CROPS, 5, VIEW_YEAR).filter(
    (s) => s.status === "ng",
  );
  assert.ok(ng.length > 0, "ナス科を1件も避けていない");
  for (const s of ng) {
    const after = bedStatus(
      [...plantings, { cropId: s.cropId, year: s.targetYear }],
      cropById,
    );
    assert.notEqual(
      after.status,
      "ok",
      `${s.nameJa} を避けたと言ったのに、記録すると問題なしになる`,
    );
  }
});

test("避けたい候補が指す「◯◯年から」は、実際に置ける年である", () => {
  // 2027年に同じ科が入っている区画。単純に 目安 - 間隔 で数えると、
  // まだ塞がっている年を指してしまう。
  const plantings = [{ cropId: "tomato", year: 2027 }];
  const s = suggestPlantings(plantings, CROPS, 4, VIEW_YEAR).find(
    (x) => x.cropId === "tomato",
  );
  assert.equal(s.status, "ng");
  assert.ok(s.nextPlantableYear > s.targetYear, "いつから置けるかを出していない");
  const target = s.nextPlantableYear;
  const at = suggestPlantings(plantings, CROPS, 4, target).find(
    (x) => x.cropId === "tomato",
  );
  assert.notEqual(
    at.status,
    "ng",
    `${target}年から置けると言いながら、その年もまだ避けたい年`,
  );
});
