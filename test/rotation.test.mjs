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
  assert.match(r.reason, /2028年からです/);
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
  assert.equal(r.gapYears, 2);
});

test("evaluateRotation: 同科の複数履歴では判定年に最も近い年を採用", () => {
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
  assert.equal(near.gapYears, 2);
  assert.match(near.reason, /2028年/);

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

// 判定年より後にある記録が、暦の未来とは限らない。去年・一昨年の記録を後から
// 入れるのは記録ツールの中心的な使い方で、そのとき「2024年に植える予定です」
// 「ずらすのがおすすめ」と言うと、済んだことに対する実行不能な助言になる。
// 判定エンジンは暦の今日を持たない（Date に依存しない）ので、文言は時制を
// 断定しない言い方に揃える。
test("evaluateRotation: 説明文が時制を断定しない（過ぎた年を『予定』と呼ばない）", () => {
  // 2023年に植えようとしていて、2024年に同じ科の記録がある（どちらも過去）。
  const r = evaluateRotation(
    [{ familyKey: "solanaceae", year: 2024 }],
    "solanaceae",
    3,
    2023,
  );
  assert.equal(r.nearestSameFamilyYear, 2024, "判定年より後という関係自体は保つ");
  assert.doesNotMatch(r.reason, /予定|ずらす|植えています|経過して/);
  assert.match(r.reason, /2024年/);

  // caution / ok 側も同じ。
  for (const [req, target] of [
    [1, 2023],
    [4, 2020],
  ]) {
    const x = evaluateRotation(
      [{ familyKey: "solanaceae", year: 2024 }],
      "solanaceae",
      req,
      target,
    );
    assert.doesNotMatch(
      x.reason,
      /予定|ずらす|植えています|経過して/,
      `req=${req} で時制を断定している`,
    );
  }
});

// --- 「あと◯年」は実際に置ける年を指す -------------------------------------

test("evaluateRotation: あと◯年が、別の同じ科で塞がった年を指さない", () => {
  // 2024年 と 2028年 に記録がある区画に、2026年に植えようとする。
  // 直近の1件だけで req - gap = 2 と数えると 2028年 を指すが、そこは埋まっている。
  const past = [
    { familyKey: "solanaceae", year: 2024 },
    { familyKey: "solanaceae", year: 2028 },
  ];
  const r = evaluateRotation(past, "solanaceae", 4, 2026);
  assert.equal(r.status, "ng");
  assert.notEqual(r.nextPlantableYear, 2028, "塞がっている2028年を指している");
  // 指した年が実際に避けなくてよい年であることを、判定を呼び直して確かめる。
  const at = evaluateRotation(past, "solanaceae", 4, r.nextPlantableYear);
  assert.notEqual(at.status, "ng", `${r.nextPlantableYear}年も避けたい年だった`);
  assert.match(r.reason, new RegExp(`${r.nextPlantableYear}年からです`));
  // ひとつ手前の年はまだ避けたい年（最小の年を指している）。
  assert.equal(
    evaluateRotation(past, "solanaceae", 4, r.nextPlantableYear - 1).status,
    "ng",
    "必要以上に先の年を指している",
  );
});

test("evaluateRotation: 単純なケースの『あと◯年』は従来どおり", () => {
  const r = evaluateRotation(
    [{ familyKey: "solanaceae", year: 2024 }],
    "solanaceae",
    4,
    2026,
  );
  assert.equal(r.nextPlantableYear, 2028);
  assert.equal(
    r.reason,
    "2024年に同じ科の作付けがあります。どの作付けからも目安の4年あくのは2028年からです。",
  );
});

test("evaluateRotation: 避けなくてよい判定では あと◯年 を持たない", () => {
  for (const [req, years, target] of [
    [4, [2019], 2026], // ok
    [4, [2022], 2026], // caution
    [0, [2026], 2026], // 連作に強い科
    [4, [], 2026], // 記録なし
  ]) {
    const r = evaluateRotation(
      years.map((y) => ({ familyKey: "solanaceae", year: y })),
      "solanaceae",
      req,
      target,
    );
    assert.notEqual(r.status, "ng");
    assert.equal(r.nextPlantableYear, null, `${JSON.stringify(years)} req=${req}`);
  }
});

// --- 同年（間隔0）の扱い -----------------------------------------------------

test("evaluateRotation: 同年の作付けは間隔0の衝突として扱う（境界）", () => {
  const r = evaluateRotation(
    [{ familyKey: "solanaceae", year: 2026 }],
    "solanaceae",
    4,
    2026,
  );
  assert.equal(r.gapYears, 0);
  assert.equal(r.nearestSameFamilyYear, 2026);
  assert.equal(r.status, "ng");
  assert.equal(r.nextPlantableYear, 2030);
  assert.equal(
    r.reason,
    "2026年に同じ科の作付けがあります。どの作付けからも目安の4年あくのは2030年からです。",
  );
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
  // 見出し「すでに記録した作付けの判定 ── 2026年 トマト」の直下に出る文なので、
  // 「記録はありません」と裸で言わない（判定対象の作付け自身は履歴から外している）。
  assert.equal(r.reason, "前後の年に、同じ科の作付けはほかにありません。");
  assert.doesNotMatch(r.reason, /2026年までに/);
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
    "2024年に同じ科の作付けがあります。どの作付けからも目安の4年あくのは2028年からです。",
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
    "2022年に同じ科の作付けがあります。間隔は目安の4年ちょうどです。",
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
    "2019年に同じ科の作付けがあります。間隔は7年です（目安4年）。",
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
  assert.equal(r.gapYears, 10);
  assert.equal(r.status, "ok");
});

// --- 対称性そのものを固定する（除外領域を持たない検査） -----------------------
//
// この変更の芯は「同じ科を A年 と B年 に置くとき、困るのは両方で、間隔は
// どちらから見ても同じ」という一点。走査の都合で除外領域を持つ検査
// （recommendConsistency.test.mjs）とは別に、この性質だけを直接固定する。
// 片側からしか数えない実装に戻すと、必ずここが落ちる。

test("evaluateRotation: A年からB年を見た判定と、B年からA年を見た判定が一致する", () => {
  const F = "solanaceae";
  const bad = [];
  for (let a = 2020; a <= 2032; a++) {
    for (let b = 2020; b <= 2032; b++) {
      for (let req = 0; req <= 6; req++) {
        const ab = evaluateRotation([{ familyKey: F, year: b }], F, req, a);
        const ba = evaluateRotation([{ familyKey: F, year: a }], F, req, b);
        if (ab.status !== ba.status || ab.gapYears !== ba.gapYears) {
          bad.push(`A=${a} B=${b} req=${req}: ${ab.status}/${ab.gapYears} vs ${ba.status}/${ba.gapYears}`);
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length}件で前後が非対称`);
});

test("evaluateRotation: 同じ間隔なら、どの年を名指ししても判定は変わらない", () => {
  const F = "solanaceae";
  // 判定年の前後に等距離で記録がある場合。どちらを採っても status は同じでなければ、
  // tie-break の選び方が判定を動かしていることになる。
  for (let req = 1; req <= 6; req++) {
    for (let d = 0; d <= 8; d++) {
      const both = evaluateRotation(
        [
          { familyKey: F, year: 2026 - d },
          { familyKey: F, year: 2026 + d },
        ],
        F,
        req,
        2026,
      );
      const onlyPast = evaluateRotation([{ familyKey: F, year: 2026 - d }], F, req, 2026);
      const onlyFuture = evaluateRotation([{ familyKey: F, year: 2026 + d }], F, req, 2026);
      assert.equal(both.status, onlyPast.status, `req=${req} d=${d}`);
      assert.equal(both.status, onlyFuture.status, `req=${req} d=${d}`);
      assert.equal(
        both.nearestSameFamilyYear,
        2026 - d,
        "同じ間隔なら過去の年を名指しする",
      );
    }
  }
});
