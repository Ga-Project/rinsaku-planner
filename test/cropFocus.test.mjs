// cropFocus.mjs（野菜 → 植えられる区画）の回帰テスト。
//
// ■ このファイルが守っているもの
//   1. 判定の向き。必要なあき年数は「これから植える野菜」自身の値で、区画に最後に
//      植えた野菜の値ではない（マスタ59件中20件で食い違う）。実装と同じ式を書き写して
//      assert すると誤りをそのまま仕様として固定するので、既存の判定エンジン
//      （rotation.mjs の bedStatus）を実際に呼んで一致することを検査する。
//   2. リンクを出す側と読む側の往復。野菜ページが書き出す ?crop= と、プランナーが
//      それを読む処理が食い違うと、59ページのリンクは正しいまま機能だけが黙って死ぬ。
//      クエリ名を1文字変えると落ちるように、生成 → 解釈を通しで検査する。

import test from "node:test";
import assert from "node:assert/strict";

import {
  CROP_PARAM,
  plannerHrefForCrop,
  focusCropIdFromSearch,
  normalizeFocusCropId,
  hrefWithoutCrop,
  focusBedVerdicts,
  verdictNote,
  verdictDetail,
  sameYearNote,
  laterNote,
  summarizeFocus,
} from "../app/lib/cropFocus.mjs";
import { bedStatus } from "../app/lib/rotation.mjs";
import { CROPS, cropById } from "../app/lib/crops.mjs";

const BASE_YEAR = 2026;
const ORIGIN = "https://ga-project.github.io/rinsaku-planner";

/** 作付け履歴だけを持つ区画をつくる。 */
function bed(id, plantings, label) {
  return {
    id,
    label: label ?? id,
    kind: "row",
    col: 0,
    row: 0,
    plantings: plantings.map((p, i) => ({ id: `${id}-p${i}`, ...p })),
  };
}

// --- リンクと読み取りの往復 -------------------------------------------------

// 全59件を回すが、slug は全て ascii なので encodeURIComponent は作用しない＝
// 判別力は1件と同じ。クエリ名の変更を実際に捉えているのは次の CROP_PARAM の検査で、
// このループは「生成と読み取りが同じ規約で動くこと」を全 slug で確認する役割。
test("野菜ページが出すリンクを、プランナー側がそのまま解釈できる（全59件）", () => {
  for (const c of CROPS) {
    const href = plannerHrefForCrop(c.id);
    // next/link が basePath を前置した後の URL を再現する。
    const search = new URL(`${ORIGIN}${href}`).search;
    assert.equal(
      focusCropIdFromSearch(search, CROPS),
      c.id,
      `${c.nameJa}: ${href} を読み戻せない`,
    );
  }
});

test("リンクはプランナー本体のアンカーへ向き、クエリ名は1箇所で決まる", () => {
  assert.equal(plannerHrefForCrop("tomato"), `/?${CROP_PARAM}=tomato#app`);
  assert.equal(CROP_PARAM, "crop");
});

test("解除すると crop だけが URL から落ち、他のクエリと hash は残る", () => {
  assert.equal(hrefWithoutCrop(`${ORIGIN}/?crop=tomato#app`), "/rinsaku-planner/#app");
  assert.equal(
    hrefWithoutCrop(`${ORIGIN}/?a=1&crop=tomato&b=2`),
    "/rinsaku-planner/?a=1&b=2",
  );
  // 元から crop が無くても壊れない
  assert.equal(hrefWithoutCrop(`${ORIGIN}/?a=1`), "/rinsaku-planner/?a=1");
});

test("解除後の URL を読み戻すと、絞り込みは復活しない", () => {
  const cleared = hrefWithoutCrop(`${ORIGIN}/?crop=tomato#app`);
  const search = new URL(`https://example.test${cleared}`).search;
  assert.equal(focusCropIdFromSearch(search, CROPS), null);
});

test("クエリに無い・壊れている場合は絞り込まない", () => {
  for (const search of ["", "?", "?other=1", "?crop=", "?crop=not-a-crop", null, undefined, 42]) {
    assert.equal(
      focusCropIdFromSearch(search, CROPS),
      null,
      `${JSON.stringify(search)} が null にならない`,
    );
  }
});

test("マスタに無い値・文字列でない値は null にする", () => {
  for (const raw of [
    "not-a-crop", "", "  ", "<script>", "../../etc/passwd", "TOMATO", "tomato ",
    null, undefined, 42, { id: "tomato" }, ["tomato"],
  ]) {
    assert.equal(
      normalizeFocusCropId(raw, CROPS),
      null,
      `${JSON.stringify(raw)} が null にならない`,
    );
  }
  assert.equal(normalizeFocusCropId("tomato", CROPS), "tomato");
});

// --- 判定の向き ------------------------------------------------------------

test("区画ごとの判定は、その野菜を実際に植えたときの判定と一致する（同一作物・単独の科も含む全組み合わせ）", () => {
  let pairs = 0;
  for (const before of CROPS) {
    // 同じ科の全作物 + 自分自身。単独の科（オクラ等5件）もこれで必ず1周する。
    const targets = CROPS.filter((c) => c.familyKey === before.familyKey);
    for (const after of targets) {
      for (let gap = 0; gap <= after.rotationYears + 1; gap++) {
        const target = BASE_YEAR + gap;
        const [v] = focusBedVerdicts(
          [bed("b1", [{ cropId: before.id, year: BASE_YEAR }])],
          after,
          cropById,
          target,
        );
        const judged = bedStatus(
          [
            { cropId: before.id, year: BASE_YEAR },
            { cropId: after.id, year: target },
          ],
          cropById,
        );
        // 例外を置かない。gap 0（同年）も含めて、帯の判定は
        // 「その野菜を実際に植えたときの判定」と完全に一致しなければならない。
        // ここに例外を1つ置くと、帯と編集パネルが食い違う欠陥を検査から外すことになる。
        assert.equal(
          v.status,
          judged.status,
          `${before.nameJa} の区画に ${gap} 年後 ${after.nameJa}: 一覧は ${v.status} / 実際に植えると ${judged.status}`,
        );
        pairs++;
      }
    }
  }
  assert.ok(pairs > 200, `組み合わせが少なすぎる: ${pairs}`);
});

test("単独の科でも判定が回る（同じ科に仲間がいない5件）", () => {
  const solo = CROPS.filter(
    (c) => CROPS.filter((x) => x.familyKey === c.familyKey).length === 1,
  );
  assert.ok(solo.length > 0, "単独の科がマスタから消えた");
  for (const c of solo) {
    const [v] = focusBedVerdicts([bed("b1", [])], c, cropById, BASE_YEAR);
    assert.equal(v.status, "ok", `${c.nameJa} が空の区画で ok にならない`);
  }
});

test("必要年数は植える側の野菜のもので、区画に最後に植えた野菜のものではない", () => {
  const tomato = cropById("tomato");
  const potato = cropById("potato");
  assert.equal(tomato.rotationYears, 4);
  assert.equal(potato.rotationYears, 3);

  const beds = [bed("b1", [{ cropId: "tomato", year: BASE_YEAR }])];
  assert.equal(focusBedVerdicts(beds, potato, cropById, BASE_YEAR + 3)[0].status, "caution");
  assert.equal(focusBedVerdicts(beds, potato, cropById, BASE_YEAR + 2)[0].status, "ng");
});

test("その年すでに同じ科を記録していても、判定は書き換えず注記として添える", () => {
  const tomato = cropById("tomato");

  // 同じ野菜を同年に記録している区画: 判定は判定エンジンのまま（同年＝あき0年で ng）。
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "tomato", year: BASE_YEAR }])],
    tomato, cropById, BASE_YEAR,
  );
  const judged = bedStatus(
    [{ cropId: "tomato", year: BASE_YEAR }, { cropId: "tomato", year: BASE_YEAR }],
    cropById,
  );
  assert.equal(v.status, judged.status);
  assert.equal(v.remainingYears, judged.requiredYears - judged.gapYears); // 「あと◯年」を握り潰さない
  assert.deepEqual(v.sameYearRecord, [
    { cropId: "tomato", nameJa: "トマト", year: BASE_YEAR },
  ]);
  assert.equal(sameYearNote(v, BASE_YEAR), `${BASE_YEAR}年はこの区画にトマトを記録しています。`);

  // 同じ科の「別の作物」を記録している区画: 記録したのはナスであってトマトではない。
  const [w] = focusBedVerdicts(
    [bed("b2", [{ cropId: "eggplant", year: BASE_YEAR }])],
    tomato, cropById, BASE_YEAR,
  );
  assert.deepEqual(w.sameYearRecord, [
    { cropId: "eggplant", nameJa: "ナス", year: BASE_YEAR },
  ]);
  assert.equal(sameYearNote(w, BASE_YEAR), `${BASE_YEAR}年はこの区画にナスを記録しています。`);
  assert.doesNotMatch(sameYearNote(w, BASE_YEAR), /トマト/);

  // 別の科の記録は注記にも出さない
  const [x] = focusBedVerdicts(
    [bed("b3", [{ cropId: "cabbage", year: BASE_YEAR }])],
    tomato, cropById, BASE_YEAR,
  );
  assert.deepEqual(x.sameYearRecord, []);
  assert.equal(sameYearNote(x, BASE_YEAR), "");
});

test("あけ年数0の科は、同年に記録があっても植えられる区画のまま", () => {
  // ネギ（ヒガンバナ科・あけ年数0）を記録した区画に、同じ科のニラを同年。
  const chive = cropById("chinese-chive");
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "green-onion", year: BASE_YEAR }])],
    chive, cropById, BASE_YEAR,
  );
  assert.equal(v.status, "ok", "追い蒔きできる区画を落としている");
  assert.equal(verdictNote(v), "");
  // 記録があることは注記としては出す
  assert.deepEqual(v.sameYearRecord, [
    { cropId: "green-onion", nameJa: "ネギ", year: BASE_YEAR },
  ]);
});

test("あと何年あければよいかを ng の区画にだけ持たせる（判定エンジンと突合）", () => {
  const tomato = cropById("tomato");
  const beds = [bed("b1", [{ cropId: "eggplant", year: BASE_YEAR }])];
  for (let gap = 1; gap <= tomato.rotationYears + 1; gap++) {
    const [v] = focusBedVerdicts(beds, tomato, cropById, BASE_YEAR + gap);
    const judged = bedStatus(
      [{ cropId: "eggplant", year: BASE_YEAR }, { cropId: "tomato", year: BASE_YEAR + gap }],
      cropById,
    );
    if (judged.status === "ng") {
      assert.equal(v.remainingYears, judged.requiredYears - judged.gapYears);
      assert.equal(verdictNote(v), `あと${v.remainingYears}年`);
    } else {
      assert.equal(v.remainingYears, null);
    }
  }
});

test("判定した年を必ず持ち帰る（画面で年を出せる）", () => {
  const [v] = focusBedVerdicts([bed("b1", [])], cropById("tomato"), cropById, 2031);
  assert.equal(v.targetYear, 2031);
});

test("記録の無い区画・マスタに無い作物の記録しか無い区画は ok", () => {
  const verdicts = focusBedVerdicts(
    [bed("empty", []), bed("unknown", [{ cropId: "no-such-crop", year: BASE_YEAR }])],
    cropById("tomato"), cropById, BASE_YEAR,
  );
  assert.equal(verdicts.length, 2);
  for (const v of verdicts) assert.equal(v.status, "ok");
});

test("植えられる区画を先に、避けたい区画を最後に並べる（同じ判定の中は区画の並び順を保つ）", () => {
  const verdicts = focusBedVerdicts(
    [
      // 同年の同科＝あき0年。最も重い衝突だが、判定としては ng（軽く見せない）。
      bed("same-year", [{ cropId: "tomato", year: BASE_YEAR }]),
      bed("ng", [{ cropId: "eggplant", year: BASE_YEAR - 1 }]),
      bed("ok", []),
      bed("caution", [{ cropId: "eggplant", year: BASE_YEAR - 4 }]),
    ],
    cropById("tomato"), cropById, BASE_YEAR,
  );
  // 判定の軽い順。同じ判定の中は元の並び順（グリッドの並びと対応させる）。
  assert.deepEqual(
    verdicts.map((v) => v.bedId),
    ["ok", "caution", "same-year", "ng"],
  );
  // 同年の記録がある区画は ng のまま＝ok/caution より上に浮かない
  const sameYear = verdicts.find((v) => v.bedId === "same-year");
  assert.equal(sameYear.status, "ng");
  assert.equal(verdictNote(sameYear), "あと4年"); // 「あと◯年」を握り潰さない
});

test("壊れた入力では空の一覧を返す（画面に出す前に落ちない）", () => {
  const tomato = cropById("tomato");
  assert.deepEqual(focusBedVerdicts([], tomato, cropById, BASE_YEAR), []);
  assert.deepEqual(focusBedVerdicts(null, tomato, cropById, BASE_YEAR), []);
  assert.deepEqual(focusBedVerdicts([bed("b1", [])], null, cropById, BASE_YEAR), []);
  assert.deepEqual(focusBedVerdicts([bed("b1", [])], tomato, cropById, "2026"), []);
});

// --- 見出し ----------------------------------------------------------------

test("見出しは caution を ok に吸収しない（ok が1つでもある場合を含む）", () => {
  // ok があっても caution は別に数えて別に言う
  assert.equal(
    summarizeFocus([{ status: "ok" }, { status: "caution" }], "トマト").headline,
    "トマトを植えるなら、2区画のうちそのまま植えられる区画が1区画、間隔に注意すれば植えられる区画が1区画です。",
  );
  // ok だけのときだけ「すべてに」と言う
  assert.equal(
    summarizeFocus([{ status: "ok" }, { status: "ok" }], "ナス").headline,
    "2区画すべてにナスを植えられます。",
  );
});

test("見出しは避けたい区画の数を落とさない", () => {
  // 「植えられる」側だけ言うと、避けたい区画があること自体が見出しから消える。
  const h = summarizeFocus(
    [{ status: "ok" }, { status: "ng" }, { status: "ng" }],
    "ナス",
  ).headline;
  assert.match(h, /いまは避けたい区画が2区画/);
});

test("見出しは「◯区画のうち◯区画」と言わない（群が1つのとき）", () => {
  // 群が1つしか無いのに「のうち」で受けると、何も絞っていない文になる
  // （例: 「3区画のうち、3区画は間隔に注意して…」）。
  for (const [n, name, expected] of [
    [2, "ナス", "2区画すべて、間隔に注意すればナスを植えられます。"],
    [3, "ナス", "3区画すべて、間隔に注意すればナスを植えられます。"],
  ]) {
    const h = summarizeFocus(
      Array.from({ length: n }, () => ({ status: "caution" })),
      name,
    ).headline;
    assert.equal(h, expected);
    assert.doesNotMatch(h, /のうち/);
  }
});

test("区画が1つのときは「1区画すべて」と言わない", () => {
  assert.equal(
    summarizeFocus([{ status: "ok" }], "ナス").headline,
    "この区画にナスを植えられます。",
  );
  assert.equal(
    summarizeFocus([{ status: "caution" }], "ナス").headline,
    "この区画は、間隔に注意すればナスを植えられます。",
  );
});

test("見出しに助詞の衝突（「◯区画に」と「◯区画は」の並び）を残さない", () => {
  const h = summarizeFocus(
    [{ status: "ok" }, { status: "caution" }],
    "トマト",
  ).headline;
  assert.doesNotMatch(h, /1区画に.*1区画は/);
});

test("区画が無いとき・どこにも植えられないときで見出しを変える", () => {
  assert.equal(
    summarizeFocus([], "ナス").headline,
    "区画をつくると、ナスを植えられるかどうかが出ます。",
  );
  assert.equal(
    summarizeFocus([{ status: "ng" }, { status: "ng" }], "ナス").headline,
    "いまの記録では、ナスをすぐ植えられる区画はありません。",
  );
});

test("数え上げは要素が壊れていても落ちない（防御の非対称を残さない）", () => {
  for (const input of [null, "not-an-array", [null], [undefined], [{ status: "ok" }, null], [{}]]) {
    assert.doesNotThrow(() => summarizeFocus(input, "トマト"), `${JSON.stringify(input)} で落ちる`);
  }
  assert.equal(summarizeFocus([{ status: "ok" }, null], "トマト").ok, 1);
  assert.equal(verdictNote(null), "");
});

// --- 年の扱い（注記は「その年」だけ・未来年は判定に入れずに必ず言う） ----------

test("同じ科でも、その年でない記録は『その年の記録』にしない", () => {
  // 年を見ない実装に退行しても他の検査は全部通るため、ここで年の条件だけを固定する。
  // 退行すると「前年の記録」を「今年この区画に記録しています」と言うことになる。
  const tomato = cropById("tomato");
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "tomato", year: BASE_YEAR - 1 }])],
    tomato,
    cropById,
    BASE_YEAR,
  );
  assert.deepEqual(v.sameYearRecord, [], "前年の記録を『その年』に数えている");
  assert.equal(sameYearNote(v, BASE_YEAR), "");
  // 判定そのものには前年の記録が効いている（注記と判定を取り違えていない）。
  assert.equal(v.status, "ng");
  assert.equal(v.lastSameFamilyYear, BASE_YEAR - 1);
});

test("翌年以降に記録している同じ科は、判定には入れずに必ず注記へ出す", () => {
  // 年の入力は 1900〜3000 を受けるので、翌季の計画を先に入れるのは正常な使い方。
  // 判定（evaluateRotation）は targetYear までの履歴しか見ない仕様なので、
  // ここを拾わないと、グリッドが「トマト（2030）」と出している区画について
  // 帯が「記録はありません」と言い切ることになる。
  const tomato = cropById("tomato");
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "tomato", year: BASE_YEAR + 4 }])],
    tomato,
    cropById,
    BASE_YEAR,
  );

  // 判定は変えない（この製品の判定は targetYear までの履歴で行う）。
  assert.equal(v.status, "ok");
  assert.equal(v.lastSameFamilyYear, null);

  // 記録があること自体は必ず言う。
  assert.deepEqual(v.laterRecord, [
    { cropId: "tomato", nameJa: "トマト", year: BASE_YEAR + 4 },
  ]);
  const note = laterNote(v);
  assert.match(note, /2030年にトマト/);
  assert.match(note, /この判定には含めていません/);

  // 「記録はありません」と裸で言い切らない（判定の範囲を必ず添える）。
  assert.match(v.reason, new RegExp(`${BASE_YEAR}年までに`));
  assert.match(verdictDetail(v), new RegExp(`${BASE_YEAR}年までに`));
});

test("翌年以降の記録は、年の早い順に・別の科は混ぜずに並べる", () => {
  const tomato = cropById("tomato");
  const [v] = focusBedVerdicts(
    [
      bed("b1", [
        { cropId: "eggplant", year: BASE_YEAR + 5 },
        { cropId: "cabbage", year: BASE_YEAR + 1 }, // 別の科は出さない
        { cropId: "tomato", year: BASE_YEAR + 2 },
      ]),
    ],
    tomato,
    cropById,
    BASE_YEAR,
  );
  assert.deepEqual(
    v.laterRecord.map((r) => [r.year, r.nameJa]),
    [
      [BASE_YEAR + 2, "トマト"],
      [BASE_YEAR + 5, "ナス"],
    ],
  );
  assert.doesNotMatch(laterNote(v), /キャベツ/);
});

test("翌年以降の記録が無ければ注記は出ない", () => {
  const tomato = cropById("tomato");
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "tomato", year: BASE_YEAR - 6 }])],
    tomato,
    cropById,
    BASE_YEAR,
  );
  assert.deepEqual(v.laterRecord, []);
  assert.equal(laterNote(v), "");
  assert.equal(laterNote(null), "");
});

// --- チップの1行説明 --------------------------------------------------------

test("チップの説明は、あき年数を1枚の中で二度言わない", () => {
  // 「あと◯年」はバッジ（verdictNote）が持つ。説明が同じ数をもう一度言うと、
  // 同じ1件の作付けを2文が繰り返し、狭い画面でグリッドが押し出される。
  const tomato = cropById("tomato");
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "tomato", year: BASE_YEAR - 2 }])],
    tomato,
    cropById,
    BASE_YEAR,
  );
  const badge = verdictNote(v); // 「あと2年」
  assert.equal(badge, `あと${v.remainingYears}年`);
  assert.doesNotMatch(
    verdictDetail(v),
    new RegExp(`あと${v.remainingYears}年`),
    "バッジと説明が同じ数を繰り返している",
  );
  // 説明は「いつ・目安いくつ」の事実を持つ。
  assert.match(verdictDetail(v), new RegExp(`${BASE_YEAR - 2}年`));
  assert.match(verdictDetail(v), new RegExp(`目安${v.requiredYears}年`));
});

test("チップの説明は、あけ年数0の科では年数の話をしない", () => {
  const chive = cropById("chinese-chive");
  const [v] = focusBedVerdicts(
    [bed("b1", [{ cropId: "green-onion", year: BASE_YEAR }])],
    chive,
    cropById,
    BASE_YEAR,
  );
  assert.equal(verdictDetail(v), "続けて植えやすい科です");
});

test("チップの説明は壊れた入力でも落ちない", () => {
  assert.equal(verdictDetail(null), "");
  assert.doesNotThrow(() => verdictDetail({ requiredYears: 4 }));
});
