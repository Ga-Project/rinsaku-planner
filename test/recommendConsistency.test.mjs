// 「勧めたものを記録したら、その区画が赤くなる」を起こさないための検査。
//
// この製品は同じ問いに2つの経路で答える:
//   - これから植める場合の判定（suggestPlantings / 編集パネルのプレビュー）
//   - すでに記録した作付けの判定（bedStatus → 区画セルの色）
// 利用者は前者を見て記録するので、前者が「そのまま植えられます」と言ったものを
// 記録した直後に後者が「連作NG」を出すと、製品が自分の勧めを自分で否定する。
//
// 実装の式を書き写すのではなく、**両方の経路を実際に呼んで突き合わせる**。
// 片方だけ直しても落ちる。

import test from "node:test";
import assert from "node:assert/strict";

import { suggestPlantings } from "../app/lib/suggest.mjs";
import { bedStatus } from "../app/lib/rotation.mjs";
import { CROPS, cropById } from "../app/lib/crops.mjs";

/** 勧められた候補を実際に記録した区画をつくる。 */
function recordInto(plantings, cropId, year) {
  return [...plantings, { cropId, year }];
}

test("勧めた候補を記録しても、その区画が連作NGにならない（全作物×全月×予定あり）", () => {
  const viewYear = 2026;
  /** 区画にすでに入っている記録のパターン。未来の予定を含む。 */
  const beds = [
    [],
    [{ cropId: "tomato", year: 2024 }],
    [{ cropId: "tomato", year: 2027 }], // 翌季の計画を先に入れてある
    [{ cropId: "eggplant", year: 2028 }],
    [{ cropId: "cabbage", year: 2025 }, { cropId: "tomato", year: 2029 }],
    [{ cropId: "green-onion", year: 2026 }],
  ];

  const bad = [];
  for (const plantings of beds) {
    for (let month = 1; month <= 12; month++) {
      for (const s of suggestPlantings(plantings, CROPS, month, viewYear)) {
        if (s.status !== "ok") continue; // 「そのまま植えられる」と言ったものだけ
        const after = bedStatus(
          recordInto(plantings, s.cropId, s.targetYear),
          cropById,
        );
        if (after.status === "ng") {
          bad.push(
            `${JSON.stringify(plantings)} / ${month}月 / ${s.nameJa}(${s.targetYear}) ` +
              `→ 勧めた: ok, 記録後: ${after.status}`,
          );
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length}件で勧めと結果が食い違う`);
});

test("避けたいと言った候補は、記録すると実際に区画が赤くなる（逆向きの取りこぼし）", () => {
  // 「安全側に倒しすぎて何も勧めない」状態を通さないための対の検査。
  const viewYear = 2026;
  const plantings = [{ cropId: "tomato", year: 2025 }];
  const list = suggestPlantings(plantings, CROPS, 5, viewYear);
  const ng = list.filter((s) => s.status === "ng");
  assert.ok(ng.length > 0, "ナス科を1件も避けていない");
  for (const s of ng) {
    const after = bedStatus(
      recordInto(plantings, s.cropId, s.targetYear),
      cropById,
    );
    assert.notEqual(
      after.status,
      "ok",
      `${s.nameJa} を避けたと言ったのに、記録すると問題なしになる`,
    );
  }
});

test("予定との衝突では「あと◯年」を出さない（待っても解けないため）", () => {
  const list = suggestPlantings(
    [{ cropId: "tomato", year: 2027 }],
    CROPS,
    4,
    2026,
  );
  const tomato = list.find((s) => s.cropId === "tomato");
  assert.ok(tomato, "4月にトマトの候補が出ていない");
  assert.equal(tomato.status, "ng");
  assert.equal(tomato.direction, "future");
  assert.equal(tomato.nearestSameFamilyYear, 2027);
  assert.equal(
    tomato.remainingYears,
    null,
    "予定との衝突に残り年数を付けている（2029年まで待っても間隔は2年にしかならない）",
  );
});
