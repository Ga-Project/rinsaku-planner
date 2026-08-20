// 読み物（早見表・FAQ）が作物マスタと食い違わないことを固定するテスト。
//
// このテストの主眼は「表示と構造化データとマスタが三者で一致していること」。
// FAQ の本文に年数を直書きすると、マスタを直したときに黙ってズレる（画面だけ古くなる）。
// ここで数値がマスタ由来であることを検査して、その事故を検出できるようにする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES, CROPS, FAMILY_HUE } from "../app/lib/crops.mjs";
import {
  familyReference,
  rotationYearsLabel,
  FAQ,
  faqJsonLd,
} from "../app/lib/reference.mjs";

test("早見表は作物を持つ全ての科を載せる", () => {
  const withCrops = new Set(CROPS.map((c) => c.familyKey));
  const listed = new Set(familyReference().map((f) => f.key));
  for (const key of withCrops) {
    assert.ok(listed.has(key), `早見表に載っていない科: ${key}`);
  }
  assert.equal(listed.size, withCrops.size);
});

test("早見表の年数はマスタ（FAMILIES）と一致する", () => {
  for (const row of familyReference()) {
    const master = FAMILIES.find((f) => f.key === row.key);
    assert.equal(row.rotationYears, master.rotationYears, `科: ${row.key}`);
  }
});

test("早見表はあける年数の降順（同数はマスタ順を保つ安定ソート）", () => {
  const rows = familyReference();
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(
      rows[i - 1].rotationYears >= rows[i].rotationYears,
      `並び順が壊れている: ${rows[i - 1].key} → ${rows[i].key}`,
    );
  }
  const fours = rows.filter((r) => r.rotationYears === 4).map((r) => r.key);
  const masterOrder = FAMILIES.filter((f) => f.rotationYears === 4).map(
    (f) => f.key,
  );
  assert.deepEqual(fours, masterOrder);
});

test("早見表の科ドット色相は BedGrid と同じ FAMILY_HUE を使う", () => {
  for (const row of familyReference()) {
    assert.equal(row.hue, FAMILY_HUE[row.key], `科: ${row.key}`);
  }
});

test("代表野菜は実在する作物名で、件数表記と矛盾しない", () => {
  const names = new Set(CROPS.map((c) => c.nameJa));
  for (const row of familyReference()) {
    assert.ok(row.crops.length > 0, `代表野菜が空: ${row.key}`);
    assert.ok(row.cropCount >= row.crops.length);
    for (const n of row.crops) {
      assert.ok(names.has(n), `存在しない作物名: ${n}`);
    }
  }
});

test("あける年数 0 は年数ではなく状態として表示する", () => {
  assert.equal(rotationYearsLabel(0), "続けて植えやすい");
  assert.equal(rotationYearsLabel(4), "4年");
});

test("FAQ の年数はマスタから導出されている（直書きでない）", () => {
  // マスタのナス科の年数が FAQ 本文に現れることを確認する。値を変えたら
  // 本文も追従するはずなので、両者が同じ出典であることの検査になる。
  const nasu = FAMILIES.find((f) => f.key === "solanaceae").rotationYears;
  const target = FAQ.find((f) => f.q.includes("ナス科"));
  assert.ok(target, "ナス科の質問が無い");
  assert.ok(
    target.a.includes(`${nasu}年あける`),
    `FAQ 本文がマスタ(${nasu}年)と一致しない: ${target.a}`,
  );
});

test("FAQ は質問が重複せず、本文が空でない", () => {
  const qs = FAQ.map((f) => f.q);
  assert.equal(new Set(qs).size, qs.length, "質問が重複している");
  assert.ok(FAQ.length >= 5);
  for (const f of FAQ) {
    assert.ok(f.a.trim().length >= 40, `本文が短すぎる: ${f.q}`);
  }
});

test("FAQPage 構造化データは画面表示の FAQ と1対1で対応する", () => {
  const ld = faqJsonLd();
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, FAQ.length);
  ld.mainEntity.forEach((entity, i) => {
    assert.equal(entity.name, FAQ[i].q);
    assert.equal(entity.acceptedAnswer.text, FAQ[i].a);
  });
});
