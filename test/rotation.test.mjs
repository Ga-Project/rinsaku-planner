// 連作判定ロジックのテスト（node:test 標準ランナー）。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRotation,
  bedStatus,
  worstStatus,
} from "../app/lib/rotation.mjs";

test("evaluateRotation: 履歴なしは ok", () => {
  const r = evaluateRotation([], "solanaceae", 4, 2026);
  assert.equal(r.status, "ok");
  assert.equal(r.lastSameFamilyYear, null);
  assert.equal(r.gapYears, null);
});

test("evaluateRotation: 間隔不足は ng（gap < 必要年数）", () => {
  const past = [{ familyKey: "solanaceae", year: 2024 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026); // gap=2 < 4
  assert.equal(r.status, "ng");
  assert.equal(r.lastSameFamilyYear, 2024);
  assert.equal(r.gapYears, 2);
  assert.match(r.reason, /あと2年/);
});

test("evaluateRotation: 目安ちょうどは caution（gap === 必要年数）", () => {
  const past = [{ familyKey: "solanaceae", year: 2022 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026); // gap=4 === 4
  assert.equal(r.status, "caution");
  assert.equal(r.gapYears, 4);
});

test("evaluateRotation: 十分あいていれば ok（gap > 必要年数）", () => {
  const past = [{ familyKey: "solanaceae", year: 2020 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026); // gap=6 > 4
  assert.equal(r.status, "ok");
  assert.equal(r.gapYears, 6);
});

test("evaluateRotation: 連作に強い科（必要年数<=0）は常に ok", () => {
  const past = [{ familyKey: "poaceae", year: 2025 }];
  const r = evaluateRotation(past, "poaceae", 0, 2026); // gap=1 だが req=0
  assert.equal(r.status, "ok");
  assert.equal(r.requiredYears, 0);
});

test("evaluateRotation: 別の科の履歴は無視する", () => {
  const past = [{ familyKey: "cucurbitaceae", year: 2025 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.status, "ok");
  assert.equal(r.lastSameFamilyYear, null);
});

test("evaluateRotation: targetYear 以降の作付けは無視する", () => {
  const past = [
    { familyKey: "solanaceae", year: 2027 }, // 未来
    { familyKey: "solanaceae", year: 2021 }, // gap=5 > 4
  ];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.lastSameFamilyYear, 2021);
  assert.equal(r.status, "ok");
});

test("evaluateRotation: 同科の複数履歴では最も新しい年を採用", () => {
  const past = [
    { familyKey: "solanaceae", year: 2020 },
    { familyKey: "solanaceae", year: 2024 },
    { familyKey: "solanaceae", year: 2022 },
  ];
  const r = evaluateRotation(past, "solanaceae", 4, 2026); // 最新2024, gap=2
  assert.equal(r.lastSameFamilyYear, 2024);
  assert.equal(r.status, "ng");
});

test("evaluateRotation: 同年の同科作付けは衝突として ng（gap 0）", () => {
  const past = [{ familyKey: "solanaceae", year: 2026 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.status, "ng");
  assert.equal(r.gapYears, 0);
  assert.equal(r.lastSameFamilyYear, 2026);
});

test("evaluateRotation: 未来年（targetYear より後）は無視する", () => {
  const past = [{ familyKey: "solanaceae", year: 2028 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.status, "ok");
  assert.equal(r.lastSameFamilyYear, null);
});

test("evaluateRotation: 負の必要年数は 0 とみなす", () => {
  const r = evaluateRotation([{ familyKey: "x", year: 2025 }], "x", -3, 2026);
  assert.equal(r.status, "ok");
  assert.equal(r.requiredYears, 0);
});

// --- bedStatus -------------------------------------------------------------

const lookup = (id) => {
  /** @type {Record<string, {familyKey:string, rotationYears:number}>} */
  const db = {
    tomato: { familyKey: "solanaceae", rotationYears: 4 },
    eggplant: { familyKey: "solanaceae", rotationYears: 4 },
    corn: { familyKey: "poaceae", rotationYears: 0 },
  };
  return db[id];
};

test("bedStatus: 作付けなしは empty", () => {
  const r = bedStatus([], lookup);
  assert.equal(r.status, "empty");
  assert.equal(r.latestCropId, null);
});

test("bedStatus: 最新作付けを基準に、過去の同科で ng 判定", () => {
  // 2023 トマト → 2026 ナス（同じナス科・gap=3 < 4）
  const r = bedStatus(
    [
      { cropId: "tomato", year: 2023 },
      { cropId: "eggplant", year: 2026 },
    ],
    lookup,
  );
  assert.equal(r.status, "ng");
  assert.equal(r.latestCropId, "eggplant");
  assert.equal(r.latestYear, 2026);
  assert.equal(r.lastSameFamilyYear, 2023);
});

test("bedStatus: 連作に強い科は ok", () => {
  const r = bedStatus(
    [
      { cropId: "corn", year: 2025 },
      { cropId: "corn", year: 2026 },
    ],
    lookup,
  );
  assert.equal(r.status, "ok");
});

test("bedStatus: 未知の作物は empty 扱い（情報なし）", () => {
  const r = bedStatus([{ cropId: "unknown", year: 2026 }], lookup);
  assert.equal(r.status, "empty");
});

test("bedStatus: 同年・同区画に同科2作物は ng（gap 0）", () => {
  const r = bedStatus(
    [
      { cropId: "tomato", year: 2026 },
      { cropId: "eggplant", year: 2026 },
    ],
    lookup,
  );
  assert.equal(r.status, "ng");
  assert.equal(r.gapYears, 0);
});

// --- worstStatus -----------------------------------------------------------

test("worstStatus: 最も深刻なステータスを返す", () => {
  assert.equal(worstStatus(["ok", "caution", "ng"]), "ng");
  assert.equal(worstStatus(["ok", "caution"]), "caution");
  assert.equal(worstStatus(["empty", "ok"]), "ok");
  assert.equal(worstStatus([]), "empty");
});
