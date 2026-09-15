// suggest.mjs（いま植えられる野菜の絞り込み）の回帰テスト。
// 暦月と区画履歴という2軸の掛け合わせなので、両軸の境界を固定する。

import test from "node:test";
import assert from "node:assert/strict";

import { suggestPlantings, groupSuggestions } from "../app/lib/suggest.mjs";
import { CROPS, cropById } from "../app/lib/crops.mjs";

/** テスト用の小さな作物マスタ（本物のマスタに依存しない境界検査用）。 */
const FIXTURE = [
  {
    id: "aki-nasu",
    nameJa: "秋ナス",
    familyJa: "ナス科",
    familyKey: "solanaceae",
    rotationYears: 4,
    sowMonths: [8],
    harvestMonths: [10],
    companionGood: [],
    companionBad: [],
    note: "",
  },
  {
    id: "hakusai",
    nameJa: "ハクサイ",
    familyJa: "アブラナ科",
    familyKey: "brassicaceae",
    rotationYears: 2,
    sowMonths: [8, 9],
    harvestMonths: [11],
    companionGood: [],
    companionBad: [],
    note: "",
  },
  {
    id: "houren",
    nameJa: "ホウレンソウ",
    familyJa: "ヒユ科",
    familyKey: "amaranthaceae",
    rotationYears: 1,
    sowMonths: [9, 10],
    harvestMonths: [11, 12],
    companionGood: [],
    companionBad: [],
    note: "",
  },
  {
    id: "satsumaimo",
    nameJa: "サツマイモ",
    familyJa: "ヒルガオ科",
    familyKey: "convolvulaceae",
    rotationYears: 0,
    sowMonths: [5],
    harvestMonths: [10],
    companionGood: [],
    companionBad: [],
    note: "",
  },
];

test("今月が適期の作物だけを now、翌月からの作物を soon で返す", () => {
  const out = suggestPlantings([], FIXTURE, 8, 2026);
  const byId = Object.fromEntries(out.map((s) => [s.cropId, s]));

  assert.equal(byId["aki-nasu"].timing, "now"); // 8月が適期
  assert.equal(byId["hakusai"].timing, "now"); // 8月が適期
  assert.equal(byId["houren"].timing, "soon"); // 9月から適期
  assert.equal(byId["satsumaimo"], undefined); // 5月のみ＝対象外
});

test("履歴が無ければ適期の作物はすべて ok になる", () => {
  const out = suggestPlantings([], FIXTURE, 8, 2026);
  assert.ok(out.length > 0);
  assert.ok(out.every((s) => s.status === "ok"));
});

test("同じ科の直近作付けがあけ年数に足りなければ ng になる", () => {
  // 2024年にナス科を植えた区画 → 2026年（gap 2 < 目安4年）は ng
  const past = [{ cropId: "aki-nasu", year: 2024 }];
  const out = suggestPlantings(past, FIXTURE, 8, 2026);
  const byId = Object.fromEntries(out.map((s) => [s.cropId, s]));

  assert.equal(byId["aki-nasu"].status, "ng");
  assert.equal(byId["aki-nasu"].nextPlantableYear, 2028);
  assert.equal(byId["aki-nasu"].conflictSide, "before");
  // 候補は科の代表値ではなく、その作物自身のあけたい年数を持ち回る
  // （文面が作物名とセットで名乗るのに要る）。
  assert.equal(byId["aki-nasu"].requiredYears, 4);
  assert.equal(byId["aki-nasu"].gapYears, 2);
  // 別の科は影響を受けない
  assert.equal(byId["hakusai"].status, "ok");
});

test("あけ年数ちょうどは caution（目安到達だがもう1年あけたい）", () => {
  // アブラナ科は目安2年。2024年作付け → 2026年は gap 2 = 目安ちょうど
  const past = [{ cropId: "hakusai", year: 2024 }];
  const byId = Object.fromEntries(
    suggestPlantings(past, FIXTURE, 8, 2026).map((s) => [s.cropId, s]),
  );
  assert.equal(byId["hakusai"].status, "caution");
});

test("連作障害が出にくい科（あけ年数0）は直近に植えていても ok", () => {
  const past = [{ cropId: "satsumaimo", year: 2025 }];
  const byId = Object.fromEntries(
    suggestPlantings(past, FIXTURE, 5, 2026).map((s) => [s.cropId, s]),
  );
  assert.equal(byId["satsumaimo"].status, "ok");
});

test("同じ年に同じ科を植えていれば ng（1年に2度は連作）", () => {
  const past = [{ cropId: "hakusai", year: 2026 }];
  const byId = Object.fromEntries(
    suggestPlantings(past, FIXTURE, 8, 2026).map((s) => [s.cropId, s]),
  );
  assert.equal(byId["hakusai"].status, "ng");
});

/** 1月まきの作物（年跨ぎ検査用）。あけ年数3年＝判定年が1年ずれると結果が変わる。 */
const JANUARY_CROP = [
  {
    id: "jan-mame",
    nameJa: "テストマメ",
    familyJa: "マメ科",
    familyKey: "fabaceae",
    rotationYears: 3,
    sowMonths: [1],
    harvestMonths: [6],
    companionGood: [],
    companionBad: [],
    note: "",
  },
];

test("12月の翌月は1月として扱う（年をまたぐ soon）", () => {
  const out = suggestPlantings([], JANUARY_CROP, 12, 2026);
  assert.equal(out.length, 1);
  assert.equal(out[0].timing, "soon");
});

test("12月に見た「翌月」は翌年の作付けとして年を繰り上げる", () => {
  const out = suggestPlantings([], JANUARY_CROP, 12, 2026);
  assert.equal(out[0].targetYear, 2027, "12月の soon は翌年に植える");

  // 同月でも「今月が適期」の候補は当年のまま
  const now = suggestPlantings([], JANUARY_CROP, 1, 2026);
  assert.equal(now[0].timing, "now");
  assert.equal(now[0].targetYear, 2026);
});

test("年跨ぎの連作判定は翌年で数える（当年で数えると候補を1年ぶん取りこぼす）", () => {
  // 2024年にマメ科を植えた区画を 2026年12月に見る。
  // 実際に植えるのは 2027年1月 → gap 3 = 目安ちょうど＝ caution（出すべき候補）。
  // 当年(2026)で数えると gap 2 < 3 で ng になり、soon から黙って消える。
  const past = [{ cropId: "jan-mame", year: 2024 }];
  const out = suggestPlantings(past, JANUARY_CROP, 12, 2026);

  assert.equal(out[0].targetYear, 2027);
  assert.equal(out[0].status, "caution");
  assert.equal(out[0].nearestSameFamilyYear, 2024);

  const g = groupSuggestions(out);
  assert.deepEqual(
    g.soon.map((s) => s.cropId),
    ["jan-mame"],
    "翌年で数えれば候補として残る",
  );
});

test("並びは now→soon、同じ時期なら ok→caution→ng", () => {
  const past = [
    { cropId: "aki-nasu", year: 2025 }, // ナス科 ng
    { cropId: "hakusai", year: 2024 }, // アブラナ科 caution
  ];
  const out = suggestPlantings(past, FIXTURE, 8, 2026);
  assert.deepEqual(
    out.map((s) => [s.timing, s.status]),
    [
      ["now", "caution"],
      ["now", "ng"],
      ["soon", "ok"],
    ],
  );
});

test("timing も status も同じ候補は、作物マスタの登録順に並ぶ", () => {
  // FIXTURE の 8月 now・履歴なし → aki-nasu, hakusai がいずれも ok。
  // マスタの並び（aki-nasu が先）がそのまま出力順になる。
  const asc = suggestPlantings([], FIXTURE, 8, 2026);
  assert.deepEqual(
    asc.filter((s) => s.timing === "now").map((s) => s.cropId),
    ["aki-nasu", "hakusai"],
  );

  // マスタの順を入れ替えれば出力順も入れ替わる（登録順が効いていることの確認）。
  const swapped = [FIXTURE[1], FIXTURE[0], ...FIXTURE.slice(2)];
  assert.deepEqual(
    suggestPlantings([], swapped, 8, 2026)
      .filter((s) => s.timing === "now")
      .map((s) => s.cropId),
    ["hakusai", "aki-nasu"],
  );
});

test("月が範囲外・年が非整数なら空配列", () => {
  assert.deepEqual(suggestPlantings([], FIXTURE, 0, 2026), []);
  assert.deepEqual(suggestPlantings([], FIXTURE, 13, 2026), []);
  assert.deepEqual(suggestPlantings([], FIXTURE, 8, 2026.5), []);
});

test("マスタに無い cropId の履歴は判定から無視される（落ちない）", () => {
  const past = [
    { cropId: "unknown-crop", year: 2026 },
    { cropId: "aki-nasu", year: 2025 },
  ];
  const byId = Object.fromEntries(
    suggestPlantings(past, FIXTURE, 8, 2026).map((s) => [s.cropId, s]),
  );
  assert.equal(byId["aki-nasu"].status, "ng");
  assert.equal(byId["hakusai"].status, "ok");
});

test("不正な入力でも例外にならない", () => {
  assert.deepEqual(suggestPlantings(null, null, 8, 2026), []);
  assert.ok(suggestPlantings(undefined, FIXTURE, 8, 2026).length > 0);
  // 作物マスタ側に null / id 欠けが混ざっても落ちず、健全な要素だけを返す
  const dirty = [null, { nameJa: "id無し" }, ...FIXTURE];
  assert.deepEqual(
    suggestPlantings([], dirty, 8, 2026)
      .filter((s) => s.timing === "now")
      .map((s) => s.cropId),
    ["aki-nasu", "hakusai"],
  );
});

test("種まき月に範囲外の値が混ざっていても無視される", () => {
  const broken = [
    { ...FIXTURE[0], id: "broken", sowMonths: [0, 13, 8.5, 8] },
  ];
  assert.equal(suggestPlantings([], broken, 8, 2026)[0].timing, "now");
  assert.deepEqual(suggestPlantings([], broken, 13, 2026), []);
});

test("groupSuggestions は今月ok/要注意/避けたい/翌月に振り分ける", () => {
  const past = [
    { cropId: "aki-nasu", year: 2025 }, // ng
    { cropId: "hakusai", year: 2024 }, // caution
  ];
  const g = groupSuggestions(suggestPlantings(past, FIXTURE, 8, 2026));
  assert.deepEqual(
    g.now.map((s) => s.cropId),
    [],
  );
  assert.deepEqual(
    g.caution.map((s) => s.cropId),
    ["hakusai"],
  );
  assert.deepEqual(
    g.avoid.map((s) => s.cropId),
    ["aki-nasu"],
  );
  assert.deepEqual(
    g.soon.map((s) => s.cropId),
    ["houren"],
  );
});

test("翌月の候補には連作 ng の科を出さない（これから買うものなので）", () => {
  // 9月から適期のホウレンソウ（ヒユ科・目安1年）を 2026 に植えた履歴 → soon は ng で除外
  const past = [{ cropId: "houren", year: 2026 }];
  const g = groupSuggestions(suggestPlantings(past, FIXTURE, 8, 2026));
  assert.deepEqual(
    g.soon.map((s) => s.cropId),
    [],
  );
});

test("本物の作物マスタでも動く（8月＝秋冬野菜の作付け期に候補が出る）", () => {
  const out = suggestPlantings([], CROPS, 8, 2026);
  assert.ok(out.length > 0, "8月に候補が1件も出ないのはマスタか判定の異常");
  // 返した cropId はすべてマスタに実在する
  assert.ok(out.every((s) => cropById(s.cropId) !== undefined));
  // 返した作物の適期は今月または翌月に必ず含まれる
  for (const s of out) {
    const c = cropById(s.cropId);
    const expected = s.timing === "now" ? 8 : 9;
    assert.ok(
      c.sowMonths.includes(expected),
      `${s.nameJa} の適期(${c.sowMonths})に ${expected} 月が無い`,
    );
  }
});
