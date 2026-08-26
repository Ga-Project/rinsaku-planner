// 畑めぐり（rinsaku-planner）— 「いま、この区画に植えられる野菜」の絞り込みロジック。
// UI 非依存・副作用なし（Date も参照しない＝月と年は引数で受け取る）。
// React と node:test の双方から import される。
//
// 既存の連作判定（rotation.mjs）は「植えたあと／植えようとしている1件」を評価する。
// ここはその逆向きで、区画の履歴と暦月から作物マスタ側を絞り込み、
// 苗を買う前に「この区画で今なにが植えられるか」を出す。

import { evaluateRotation } from "./rotation.mjs";

/**
 * @typedef {import("./types").Crop} Crop
 * @typedef {import("./types").RotationStatus} RotationStatus
 * @typedef {import("./rotation.mjs").PastPlanting} PastPlanting
 */

/**
 * @typedef {"now" | "soon"} Timing
 *   now=今月がその作物の種まき/植え付け適期 / soon=翌月から適期に入る
 */

/**
 * @typedef {Object} Suggestion
 * @property {string} cropId
 * @property {string} nameJa
 * @property {string} familyJa
 * @property {string} familyKey
 * @property {Timing} timing
 * @property {RotationStatus} status この区画にその科を targetYear に植えた場合の連作判定
 * @property {string} reason 判定の日本語説明（rotation.mjs の文言をそのまま使う）
 */

/** 表示順に使うステータスの並び（軽い順）。 */
const STATUS_ORDER = { ok: 0, caution: 1, ng: 2 };

/** 表示順に使う時期の並び（近い順）。 */
const TIMING_ORDER = { now: 0, soon: 1 };

/**
 * 1..12 に正規化した「翌月」を返す（12月の翌月は1月）。
 *
 * @param {number} month
 * @returns {number}
 */
function nextMonth(month) {
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
  const list = Array.isArray(sowMonths) ? sowMonths : [];
  if (list.includes(month)) return "now";
  if (list.includes(nextMonth(month))) return "soon";
  return null;
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
 * @param {number} year 植えようとしている年（西暦・整数）
 * @returns {Suggestion[]}
 */
export function suggestPlantings(plantings, crops, month, year) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];
  if (!Number.isInteger(year)) return [];

  const list = Array.isArray(crops) ? crops : [];
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
    if (!c || typeof c.id !== "string") return;
    const timing = timingOf(c.sowMonths, month);
    if (timing === null) return;

    const result = evaluateRotation(past, c.familyKey, c.rotationYears, year);
    out.push({
      order: index,
      suggestion: {
        cropId: c.id,
        nameJa: c.nameJa,
        familyJa: c.familyJa,
        familyKey: c.familyKey,
        timing,
        status: result.status,
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
