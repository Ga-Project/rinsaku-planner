// 作付けスケジュール（タイムライン）ロジックのテスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthsToBars,
  summarizeMonths,
  buildScheduleRows,
  MONTH_LABELS,
} from "../app/lib/schedule.mjs";

test("MONTH_LABELS は 12 か月", () => {
  assert.equal(MONTH_LABELS.length, 12);
  assert.equal(MONTH_LABELS[0], "1月");
  assert.equal(MONTH_LABELS[11], "12月");
});

test("monthsToBars: 指定月のみ true・長さ12", () => {
  const bars = monthsToBars([1, 6, 12]);
  assert.equal(bars.length, 12);
  assert.equal(bars[0], true);
  assert.equal(bars[5], true);
  assert.equal(bars[11], true);
  assert.equal(bars[1], false);
});

test("monthsToBars: 範囲外・非整数・重複を無視", () => {
  const bars = monthsToBars([0, 13, 5.5, 7, 7]);
  assert.equal(bars.filter(Boolean).length, 1);
  assert.equal(bars[6], true);
});

test("monthsToBars: 非配列でも空の真偽配列を返す", () => {
  const bars = monthsToBars(/** @type {any} */ (null));
  assert.equal(bars.length, 12);
  assert.equal(bars.some(Boolean), false);
});

test("summarizeMonths: 連続はレンジ・飛び石は中黒区切り", () => {
  assert.equal(summarizeMonths([4, 5, 9, 10]), "4〜5月・9〜10月");
  assert.equal(summarizeMonths([6]), "6月");
  assert.equal(summarizeMonths([11, 12, 1, 2]), "1〜2月・11〜12月");
  assert.equal(summarizeMonths([]), "");
});

test("summarizeMonths: 未ソート・重複を正規化", () => {
  assert.equal(summarizeMonths([5, 4, 4, 6]), "4〜6月");
});

test("buildScheduleRows: 作物ごとに1行・lookup 不在はスキップ", () => {
  const lookup = (id) => {
    /** @type {Record<string, any>} */
    const db = {
      tomato: { nameJa: "トマト", sowMonths: [4, 5], harvestMonths: [7, 8] },
    };
    return db[id];
  };
  const rows = buildScheduleRows(
    [{ cropId: "tomato" }, { cropId: "tomato" }, { cropId: "missing" }],
    lookup,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nameJa, "トマト");
  assert.equal(rows[0].sow[3], true); // 4月
  assert.equal(rows[0].harvest[6], true); // 7月
});
