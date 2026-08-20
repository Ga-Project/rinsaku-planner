// 読み物（早見表・FAQ・構造化データ）が作物マスタと食い違わないことを固定するテスト。
//
// このテストの主眼は「表示と構造化データとマスタが三者で一致していること」。
// FAQ の本文に年数を直書きすると、マスタを直したときに黙ってズレる（画面だけ古くなる）。
// ここで数値がマスタ由来であることを検査して、その事故を検出できるようにする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILIES, CROPS, FAMILY_HUE } from "../app/lib/crops.mjs";
import {
  familyReference,
  rotationTier,
  rotationYearsLabel,
  FAQ,
  faqJsonLd,
  appJsonLd,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "../app/lib/reference.mjs";
import { SITE_URL } from "../app/lib/site.mjs";

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

test("早見表はあける年数の降順で、同数の群はどれもマスタ順を保つ", () => {
  const rows = familyReference();
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(
      rows[i - 1].rotationYears >= rows[i].rotationYears,
      `並び順が壊れている: ${rows[i - 1].key} → ${rows[i].key}`,
    );
  }
  // 同数の群すべてについて、マスタでの相対順が保たれていること（安定ソート）。
  const groups = new Set(rows.map((r) => r.rotationYears));
  assert.ok(groups.size >= 2, "検査対象の群が足りない");
  for (const years of groups) {
    const actual = rows.filter((r) => r.rotationYears === years).map((r) => r.key);
    const expected = FAMILIES.filter(
      (f) => f.rotationYears === years && CROPS.some((c) => c.familyKey === f.key),
    ).map((f) => f.key);
    assert.deepEqual(actual, expected, `${years}年の群の順序`);
  }
});

test("全ての科に色相が定義されている（早見表と区画グリッドで同じ色を使う）", () => {
  for (const f of FAMILIES) {
    assert.equal(
      typeof FAMILY_HUE[f.key],
      "number",
      `FAMILY_HUE に色相が無い科: ${f.key}`,
    );
  }
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

test("段階（tier）の境界は 4 / 2 / 1 / 0 で、表示ラベルと整合する", () => {
  assert.equal(rotationTier(5), "heavy");
  assert.equal(rotationTier(4), "heavy");
  assert.equal(rotationTier(3), "mid");
  assert.equal(rotationTier(2), "mid");
  assert.equal(rotationTier(1), "light");
  assert.equal(rotationTier(0), "none");
  // 「続けて植えやすい」と言えるのは tier=none のときだけ。
  assert.equal(rotationYearsLabel(0), "続けて植えやすい");
  assert.equal(rotationYearsLabel(1), "1年");
  assert.equal(rotationYearsLabel(4), "4年");
  for (const f of FAMILIES) {
    const label = rotationYearsLabel(f.rotationYears);
    const isNone = rotationTier(f.rotationYears) === "none";
    assert.equal(
      label === "続けて植えやすい",
      isNone,
      `ラベルと段階が食い違う: ${f.nameJa}`,
    );
  }
});

test("早見表の段階は rotationTier と一致する", () => {
  for (const row of familyReference()) {
    assert.equal(row.tier, rotationTier(row.rotationYears), `科: ${row.key}`);
  }
});

test("FAQ が『あけずに続けやすい』と言う科は、早見表でも年数を持たない", () => {
  // 早見表が「1年」と書いている科を FAQ が「あけなくてよい」と紹介する矛盾を防ぐ。
  const target = FAQ.find((f) => f.q.includes("連作障害が出にくい"));
  assert.ok(target, "該当の質問が無い");
  const sentence = target.a.split("はあいだをあけずに続けやすい")[0];
  for (const f of FAMILIES) {
    if (!sentence.includes(f.nameJa)) continue;
    assert.equal(
      rotationTier(f.rotationYears),
      "none",
      `早見表は「${rotationYearsLabel(f.rotationYears)}」なのに FAQ があけ不要と紹介: ${f.nameJa}`,
    );
  }
  // 逆に、あけ不要の科は全部その文に出ていること。
  for (const f of FAMILIES) {
    if (rotationTier(f.rotationYears) !== "none") continue;
    assert.ok(sentence.includes(f.nameJa), `あけ不要なのに未掲載: ${f.nameJa}`);
  }
});

test("FAQ 本文に現れる年数はすべてマスタに実在する値", () => {
  // 「ナス科は5年」のような直書きの混入を面で捕まえる。
  const valid = new Set(FAMILIES.map((f) => f.rotationYears));
  for (const item of FAQ) {
    for (const m of item.a.matchAll(/(\d+)年/g)) {
      const n = Number(m[1]);
      // 「12か月」等ではなく「N年」表記のみを対象にする。
      assert.ok(
        valid.has(n),
        `マスタに存在しない年数が本文にある: ${n}年 (${item.q})`,
      );
    }
  }
});

test("FAQ の年数はマスタから導出されている（直書きでない）", () => {
  const nasu = FAMILIES.find((f) => f.key === "solanaceae").rotationYears;
  const target = FAQ.find((f) => f.q.includes("ナス科は何年"));
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

test("WebApplication 構造化データは説明・URL の出典を共有する", () => {
  const ld = appJsonLd();
  assert.equal(ld["@type"], "WebApplication");
  assert.equal(ld.name, SITE_NAME);
  assert.equal(ld.description, SITE_DESCRIPTION);
  assert.equal(ld.url, SITE_URL);
  // 無料であることの表明は price と一致していること。
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.offers.price, "0");
  assert.ok(ld.featureList.length > 0);
});

test("公開URLは末尾スラッシュ付きの絶対URL（og.png の解決が壊れない）", () => {
  assert.match(SITE_URL, /^https:\/\/[^/]+\/(?:[^/]+\/)*$/);
  assert.ok(SITE_URL.endsWith("/"));
  assert.ok(!SITE_URL.endsWith("//"));
});

test("OG画像のソースにマスタの具体値を焼き込んでいない", () => {
  // og.png はマスタから自動生成されないため、年数・科名を書くと黙ってズレる。
  const html = readFileSync(new URL("../tools/og-source.html", import.meta.url), "utf8");
  const body = html.slice(html.indexOf("<body"));
  for (const m of body.matchAll(/(\d+)年/g)) {
    assert.fail(`OG画像に年数が焼き込まれている: ${m[0]}`);
  }
  for (const f of FAMILIES) {
    assert.ok(
      !body.includes(f.nameJa),
      `OG画像に科名が焼き込まれている: ${f.nameJa}`,
    );
  }
});
