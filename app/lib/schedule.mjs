// 畑めぐり（rinsaku-planner）— 作付けスケジュール（12か月タイムライン）の純粋ロジック。
// UI 非依存・副作用なし。React と node:test の双方から import される。

/** 月ラベル（index 0 = 1月 ... 11 = 12月）。 */
export const MONTH_LABELS = /** @type {const} */ ([
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
]);

/**
 * 1..12 の月配列を、12 か月の真偽配列（index 0=1月 ... 11=12月）に変換する。
 * 範囲外・非整数・重複は無視する。
 *
 * @param {number[]} months
 * @returns {boolean[]} 長さ 12 の真偽配列
 */
export function monthsToBars(months) {
  const bars = new Array(12).fill(false);
  const list = Array.isArray(months) ? months : [];
  for (const m of list) {
    if (Number.isInteger(m) && m >= 1 && m <= 12) bars[m - 1] = true;
  }
  return bars;
}

/**
 * @typedef {Object} ScheduleRow
 * @property {string} cropId
 * @property {string} nameJa
 * @property {boolean[]} sow 種まき/植え付け月（長さ12）
 * @property {boolean[]} harvest 収穫月（長さ12）
 */

/**
 * 作物リストから、タイムライン描画用の行データを作る。
 * 同一作物が複数区画にあっても1行に集約する（重複 cropId は最初の1件）。
 *
 * @param {{cropId: string}[]} usedCrops 区画で使われている作物（cropId を持つ）
 * @param {(cropId: string) => ({id?: string, nameJa: string, sowMonths: number[], harvestMonths: number[]} | undefined)} cropLookup
 * @returns {ScheduleRow[]}
 */
export function buildScheduleRows(usedCrops, cropLookup) {
  const list = Array.isArray(usedCrops) ? usedCrops : [];
  /** @type {Map<string, ScheduleRow>} */
  const rows = new Map();
  for (const u of list) {
    if (!u || typeof u.cropId !== "string") continue;
    if (rows.has(u.cropId)) continue;
    const c = cropLookup(u.cropId);
    if (!c) continue;
    rows.set(u.cropId, {
      cropId: u.cropId,
      nameJa: c.nameJa,
      sow: monthsToBars(c.sowMonths),
      harvest: monthsToBars(c.harvestMonths),
    });
  }
  return [...rows.values()];
}

/**
 * 作物の種まき/収穫月を「○〜○月」の人間可読な範囲文字列にまとめる。
 * 連続する月はレンジに、飛び石はカンマ区切りにする（例: [4,5,9,10] → "4〜5月・9〜10月"）。
 *
 * @param {number[]} months
 * @returns {string} 月が無ければ空文字
 */
export function summarizeMonths(months) {
  const valid = (Array.isArray(months) ? months : [])
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b);
  const uniq = [...new Set(valid)];
  if (uniq.length === 0) return "";

  /** @type {Array<[number, number]>} */
  const ranges = [];
  let start = uniq[0];
  let prev = uniq[0];
  for (let i = 1; i < uniq.length; i++) {
    const m = uniq[i];
    if (m === prev + 1) {
      prev = m;
    } else {
      ranges.push([start, prev]);
      start = m;
      prev = m;
    }
  }
  ranges.push([start, prev]);

  return ranges
    .map(([a, b]) => (a === b ? `${a}月` : `${a}〜${b}月`))
    .join("・");
}
