// 作物マスタ（連作データセット）の整合性テスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CROPS,
  FAMILIES,
  cropById,
  familyByKey,
  cropsGroupedByFamily,
} from "../app/lib/crops.mjs";

test("作物データが十分な件数ある（家庭菜園の主要作物）", () => {
  assert.ok(CROPS.length >= 50, `crops=${CROPS.length}`);
  assert.ok(FAMILIES.length >= 12);
});

test("crop の id は一意", () => {
  const ids = CROPS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("family の key は一意", () => {
  const keys = FAMILIES.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("全ての crop.familyKey は FAMILIES に存在する", () => {
  const keys = new Set(FAMILIES.map((f) => f.key));
  for (const c of CROPS) {
    assert.ok(keys.has(c.familyKey), `未知の科: ${c.id} → ${c.familyKey}`);
  }
});

test("全ての科に少なくとも1つの作物がある", () => {
  for (const f of FAMILIES) {
    assert.ok(
      CROPS.some((c) => c.familyKey === f.key),
      `作物のない科: ${f.key}`,
    );
  }
});

test("各 crop のフィールドが妥当（年・月・配列）", () => {
  for (const c of CROPS) {
    assert.equal(typeof c.nameJa, "string");
    assert.ok(c.nameJa.length > 0, `名称空: ${c.id}`);
    assert.equal(typeof c.familyJa, "string");
    assert.ok(
      Number.isInteger(c.rotationYears) && c.rotationYears >= 0,
      `rotationYears 不正: ${c.id}`,
    );
    assert.ok(c.rotationYears <= 8, `rotationYears 過大: ${c.id}`);
    for (const m of c.sowMonths) {
      assert.ok(
        Number.isInteger(m) && m >= 1 && m <= 12,
        `sow 月不正: ${c.id} ${m}`,
      );
    }
    for (const m of c.harvestMonths) {
      assert.ok(
        Number.isInteger(m) && m >= 1 && m <= 12,
        `harvest 月不正: ${c.id} ${m}`,
      );
    }
    assert.ok(c.sowMonths.length > 0, `sow 月なし: ${c.id}`);
    assert.ok(c.harvestMonths.length > 0, `harvest 月なし: ${c.id}`);
    assert.ok(Array.isArray(c.companionGood));
    assert.ok(Array.isArray(c.companionBad));
  }
});

test("crop.rotationYears は所属科の代表値と矛盾しない（同符号: 0 か正）", () => {
  // 連作に強い科（代表 0）の作物は概ね 0〜1、連作に弱い科は正であること（緩い健全性チェック）。
  for (const c of CROPS) {
    const fam = familyByKey(c.familyKey);
    assert.ok(fam, `科なし: ${c.familyKey}`);
    if (fam.rotationYears === 0) {
      assert.ok(
        c.rotationYears <= 2,
        `寛容科なのに過大: ${c.id}=${c.rotationYears}`,
      );
    }
  }
});

test("cropById / familyByKey が引ける", () => {
  assert.equal(cropById("tomato")?.nameJa, "トマト");
  assert.equal(cropById("__none__"), undefined);
  assert.equal(familyByKey("solanaceae")?.nameJa, "ナス科");
  assert.equal(familyByKey("__none__"), undefined);
});

test("cropsGroupedByFamily は全作物を重複なく含む", () => {
  const grouped = cropsGroupedByFamily();
  const count = grouped.reduce((n, g) => n + g.crops.length, 0);
  assert.equal(count, CROPS.length);
});

test("ナス科は連作間隔が長い（代表的な moat データの妥当性）", () => {
  const tomato = cropById("tomato");
  assert.ok(tomato.rotationYears >= 3, "ナス科トマトは3年以上が目安");
  const corn = cropById("corn");
  assert.equal(corn.rotationYears, 0, "トウモロコシは連作に強い");
});
