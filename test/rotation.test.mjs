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
  assert.equal(r.nearestSameFamilyYear, null);
  assert.equal(r.gapYears, null);
});

test("evaluateRotation: 間隔不足は ng（gap < 必要年数）", () => {
  const past = [{ familyKey: "solanaceae", year: 2024 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026); // gap=2 < 4
  assert.equal(r.status, "ng");
  assert.equal(r.nearestSameFamilyYear, 2024);
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
  assert.equal(r.nearestSameFamilyYear, null);
});

test("evaluateRotation: 判定年に最も近い作付けを採る（過去と未来が並んでも）", () => {
  const past = [
    { familyKey: "solanaceae", year: 2027 }, // 未来・間隔1
    { familyKey: "solanaceae", year: 2021 }, // 過去・間隔5
  ];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.nearestSameFamilyYear, 2027);
  assert.equal(r.direction, "future");
  assert.equal(r.gapYears, 1);
  assert.equal(r.status, "ng");
});

test("evaluateRotation: 間隔が同じ過去と未来が並ぶときは過去を採る", () => {
  const past = [
    { familyKey: "solanaceae", year: 2028 },
    { familyKey: "solanaceae", year: 2024 },
  ];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.nearestSameFamilyYear, 2024);
  assert.equal(r.direction, "past");
  assert.equal(r.gapYears, 2);
});

test("evaluateRotation: 同科の複数履歴では最も新しい年を採用", () => {
  const past = [
    { familyKey: "solanaceae", year: 2020 },
    { familyKey: "solanaceae", year: 2024 },
    { familyKey: "solanaceae", year: 2022 },
  ];
  const r = evaluateRotation(past, "solanaceae", 4, 2026); // 最新2024, gap=2
  assert.equal(r.nearestSameFamilyYear, 2024);
  assert.equal(r.status, "ng");
});

test("evaluateRotation: 同年の同科作付けは衝突として ng（gap 0）", () => {
  const past = [{ familyKey: "solanaceae", year: 2026 }];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.status, "ng");
  assert.equal(r.gapYears, 0);
  assert.equal(r.nearestSameFamilyYear, 2026);
});

// 連作の間隔は時間対称。翌季の計画を先に入れてある区画で、これを無視すると
// 「そのまま植えられます」と勧めた直後に同じ区画が連作NGへ変わる。
test("evaluateRotation: 判定年より後の作付け（予定）も間隔として数える", () => {
  const near = evaluateRotation(
    [{ familyKey: "solanaceae", year: 2028 }],
    "solanaceae",
    4,
    2026,
  );
  assert.equal(near.status, "ng", "2年しかあかない予定を見逃している");
  assert.equal(near.nearestSameFamilyYear, 2028);
  assert.equal(near.direction, "future");
  assert.equal(near.gapYears, 2);
  assert.match(near.reason, /2028年/);
  assert.match(near.reason, /予定/);

  // 目安ちょうど・十分あいている側も同じ規則で判定する。
  assert.equal(
    evaluateRotation([{ familyKey: "solanaceae", year: 2030 }], "solanaceae", 4, 2026).status,
    "caution",
  );
  assert.equal(
    evaluateRotation([{ familyKey: "solanaceae", year: 2031 }], "solanaceae", 4, 2026).status,
    "ok",
  );
});

test("evaluateRotation: 予定との衝突と、過去との衝突を言い分ける", () => {
  const future = evaluateRotation(
    [{ familyKey: "solanaceae", year: 2027 }],
    "solanaceae",
    4,
    2026,
  );
  const pastOne = evaluateRotation(
    [{ familyKey: "solanaceae", year: 2025 }],
    "solanaceae",
    4,
    2026,
  );
  // どちらも ng だが、利用者が取れる手が違う（待つ / 予定をずらす）。
  assert.equal(future.status, "ng");
  assert.equal(pastOne.status, "ng");
  assert.doesNotMatch(future.reason, /あと\d+年あける/, "待てば解ける話ではない");
  assert.match(pastOne.reason, /あと\d+年あける/);
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
  assert.equal(r.nearestSameFamilyYear, 2023);
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

// --- bedStatus の説明文（利用者に見える契約） ---------------------------------
//
// bedStatus の reason は編集パネルの Verdict にそのまま出る。status だけを検査して
// いると、文言だけが壊れた退行を1件も捕まえられない（実際に一度、共有プリミティブ
// の文言に「判定年」を焼き込んだせいで、bedStatus 経路だけが
// 「2026年 トマト」と表示した直下で「2026年までに記録はありません」と言う状態が
// 全テスト緑のまま通った）。分岐ごとに文言を固定する。

test("bedStatus: 作付け1件だけの区画で『記録はありません』と矛盾しない", () => {
  const r = bedStatus([{ cropId: "tomato", year: 2026 }], lookup);
  // 画面はこの直前に「すでに記録した作付けの判定 ── 2026年 トマト」と出す。
  assert.equal(r.latestYear, 2026);
  assert.equal(r.status, "ok");
  assert.equal(r.reason, "この区画にこの科を植えた記録はありません。");
  assert.doesNotMatch(
    r.reason,
    /2026年までに/,
    "判定対象の作付け自身の年を、履歴の範囲として利用者に見せている",
  );
});

test("bedStatus: 各分岐の説明文を固定する", () => {
  // ng（過去の同科が近すぎる）
  const ng = bedStatus(
    [
      { cropId: "tomato", year: 2024 },
      { cropId: "tomato", year: 2026 },
    ],
    lookup,
  );
  assert.equal(ng.status, "ng");
  assert.equal(
    ng.reason,
    "2024年に同じ科を植えています。あと2年あけるのがおすすめです（目安4年）。",
  );

  // caution（目安ちょうど）
  const caution = bedStatus(
    [
      { cropId: "tomato", year: 2022 },
      { cropId: "tomato", year: 2026 },
    ],
    lookup,
  );
  assert.equal(caution.status, "caution");
  assert.equal(
    caution.reason,
    "前回の同じ科から目安の4年が経過しています。もう1年あけるとより安心です。",
  );

  // ok（十分あいている）
  const ok = bedStatus(
    [
      { cropId: "tomato", year: 2019 },
      { cropId: "tomato", year: 2026 },
    ],
    lookup,
  );
  assert.equal(ok.status, "ok");
  assert.equal(
    ok.reason,
    "前回の同じ科の作付けから7年あいています（目安4年）。",
  );

  // 作付けなし / 未知の作物
  assert.equal(bedStatus([], lookup).reason, "まだ何も植えられていません。");
  assert.equal(
    bedStatus([{ cropId: "unknown", year: 2026 }], lookup).reason,
    "作物の情報が見つかりませんでした。",
  );
});

test("bedStatus: 判定の基準になる作付け自身より後の記録は基準を動かさない", () => {
  // bedStatus は「最新の作付け」を基準にするので、基準より後の記録は存在しない。
  // 対称化しても基準の選び方は変わらないことを固定する。
  const r = bedStatus(
    [
      { cropId: "tomato", year: 2020 },
      { cropId: "tomato", year: 2030 },
    ],
    lookup,
  );
  assert.equal(r.latestYear, 2030);
  assert.equal(r.nearestSameFamilyYear, 2020);
  assert.equal(r.direction, "past");
  assert.equal(r.gapYears, 10);
  assert.equal(r.status, "ok");
});
