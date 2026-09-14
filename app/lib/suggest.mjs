// 畑めぐり（rinsaku-planner）— 「いま、この区画に植えられる野菜」の絞り込みロジック。
// UI 非依存・副作用なし（Date も参照しない＝月と年は引数で受け取る）。
// React と node:test の双方から import される。
//
// 既存の連作判定（rotation.mjs）は「植えたあと／植えようとしている1件」を評価する。
// ここはその逆向きで、区画の履歴と暦月から作物マスタ側を絞り込み、
// 苗を買う前に「この区画で今なにが植えられるか」を出す。

import { evaluateRotation } from "./rotation.mjs";

/**
 * 形の正は app/lib/types.ts（rotation.mjs と types.ts の関係に合わせる）。
 * @typedef {import("./types").Crop} Crop
 * @typedef {import("./types").Timing} Timing
 * @typedef {import("./types").Suggestion} Suggestion
 * @typedef {import("./rotation.mjs").PastPlanting} PastPlanting
 */

/** 表示順に使うステータスの並び（軽い順）。 */
const STATUS_ORDER = { ok: 0, caution: 1, ng: 2 };

/** 表示順に使う時期の並び（近い順）。 */
const TIMING_ORDER = { now: 0, soon: 1 };

/**
 * 1..12 に正規化した「翌月」を返す（12月の翌月は1月）。
 * 見出しラベルもこれを使う（折返しの実装が2箇所に割れると表示だけ静かにズレる）。
 *
 * @param {number} month
 * @returns {number}
 */
export function nextMonth(month) {
  return month === 12 ? 1 : month + 1;
}

/**
 * その作物の種まき/植え付け適期が今月か翌月かを判定する。適期外なら null。
 *
 * @param {number[]} sowMonths
 * @param {number} month 1–12
 * @returns {Timing | null}
 */
function timingOf(sowMonths, month) {
  // 値域の検証は姉妹モジュール schedule.mjs の monthsToBars と流儀を揃える。
  const list = (Array.isArray(sowMonths) ? sowMonths : []).filter(
    (m) => Number.isInteger(m) && m >= 1 && m <= 12,
  );
  if (list.includes(month)) return "now";
  if (list.includes(nextMonth(month))) return "soon";
  return null;
}

/**
 * その候補を実際に植えることになる年。
 * 12月に見た「翌月（1月）」は翌年の作付けなので、連作の間隔もその年で数える
 * （当年で数えるとあけた年数を1年少なく見積もり、出すべき候補を落とす）。
 *
 * @param {Timing} timing
 * @param {number} month 1–12
 * @param {number} year
 * @returns {number}
 */
function targetYearOf(timing, month, year) {
  return timing === "soon" && month === 12 ? year + 1 : year;
}

/**
 * 区画の履歴と暦月から、その区画に植えられる（＝いま適期の）作物を返す。
 *
 * 出力には連作 NG のものも含める。「今が旬だがこの区画では避けたい」ことこそ
 * 苗を買う前に知りたい情報で、黙って隠すと利用者は別の場所で同じ失敗をする。
 * 区別は status に持たせ、並びは ok → caution → ng（同順位は作物マスタの順）。
 *
 * @param {{cropId: string, year: number}[]} plantings 対象区画の作付け履歴
 * @param {Crop[]} crops 作物マスタ
 * @param {number} month 対象の暦月（1–12）。範囲外なら空配列を返す
 * @param {number} year 今の年（西暦・整数）。12月の「翌月」候補だけは year + 1 で判定する
 * @returns {Suggestion[]}
 */
export function suggestPlantings(plantings, crops, month, year) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];
  if (!Number.isInteger(year)) return [];

  // 不正要素はここで1度だけ落とす（Map 構築と走査で防御が食い違わないように）。
  const list = (Array.isArray(crops) ? crops : []).filter(
    (c) => c && typeof c.id === "string",
  );
  const cropMap = new Map(list.map((c) => [c.id, c]));

  // 区画の履歴を「科 × 年」に落とす（作物マスタに無い id は判定から外す）。
  /** @type {PastPlanting[]} */
  const past = (Array.isArray(plantings) ? plantings : [])
    .map((p) => {
      if (!p || typeof p.cropId !== "string" || !Number.isInteger(p.year)) {
        return null;
      }
      const c = cropMap.get(p.cropId);
      return c ? { familyKey: c.familyKey, year: p.year } : null;
    })
    .filter((p) => p !== null);

  // マスタ上の並び順を第3ソートキーに使うため、添字を別に持って回る
  // （Suggestion 自体に表示に使わないフィールドを混ぜない）。
  /** @type {{order: number, suggestion: Suggestion}[]} */
  const out = [];
  list.forEach((c, index) => {
    const timing = timingOf(c.sowMonths, month);
    if (timing === null) return;

    const targetYear = targetYearOf(timing, month, year);
    const result = evaluateRotation(
      past,
      c.familyKey,
      c.rotationYears,
      targetYear,
    );
    out.push({
      order: index,
      suggestion: {
        cropId: c.id,
        nameJa: c.nameJa,
        familyJa: c.familyJa,
        familyKey: c.familyKey,
        timing,
        targetYear,
        status: result.status,
        nearestSameFamilyYear: result.nearestSameFamilyYear,
        direction: result.direction,
        // 「あと何年あければ植えられるか」。避けたい候補が横並びになったとき、
        // あと1年のものと あと4年のものを見分けるための数字。
        // 予定との衝突では出さない: 2027年の予定に対して2026年に植えるとき、
        // 差の 4-1=3 年待っても 2029年で間隔は2年にしかならず、数が嘘になる。
        remainingYears:
          result.status === "ng" &&
          result.direction === "past" &&
          result.gapYears !== null
            ? result.requiredYears - result.gapYears
            : null,
        reason: result.reason,
      },
    });
  });

  return out
    .sort(
      (a, b) =>
        TIMING_ORDER[a.suggestion.timing] - TIMING_ORDER[b.suggestion.timing] ||
        STATUS_ORDER[a.suggestion.status] - STATUS_ORDER[b.suggestion.status] ||
        a.order - b.order,
    )
    .map((x) => x.suggestion);
}

/**
 * suggestPlantings の結果を、画面の見出し単位（今月 ok / 今月 要注意 / 今月 避けたい /
 * 翌月から）に振り分ける。UI 側で毎回 filter を書かずに済ませるための薄いまとめ。
 *
 * @param {Suggestion[]} suggestions
 * @returns {{now: Suggestion[], caution: Suggestion[], avoid: Suggestion[], soon: Suggestion[]}}
 */
export function groupSuggestions(suggestions) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  return {
    now: list.filter((s) => s.timing === "now" && s.status === "ok"),
    caution: list.filter((s) => s.timing === "now" && s.status === "caution"),
    avoid: list.filter((s) => s.timing === "now" && s.status === "ng"),
    // 翌月分は「これから買うもの」なので、この区画で避けたい科は出さない。
    soon: list.filter((s) => s.timing === "soon" && s.status !== "ng"),
  };
}
