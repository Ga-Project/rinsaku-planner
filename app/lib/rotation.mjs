// 畑めぐり（rinsaku-planner）— 連作判定の純粋ロジック（UI 非依存・副作用なし）。
// React コンポーネントと node:test の双方から import される。
// ここには DOM / localStorage / Date など環境依存を持ち込まない（テスト可能性のため）。

/**
 * @typedef {"ok" | "caution" | "ng"} RotationStatus
 *   ok=植え付けて問題なし / caution=目安ぎりぎり・もう少しあけたい / ng=連作の間隔不足
 */

/**
 * @typedef {Object} PastPlanting
 * @property {string} familyKey その作付けの作物が属する科のキー
 * @property {number} year 作付けの年（西暦）
 * @property {string} [cropId] 作物 id（任意）
 */

/**
 * @typedef {Object} RotationResult
 * @property {RotationStatus} status 判定
 * @property {number | null} lastSameFamilyYear 同じ科を直近で植えた年（無ければ null）
 * @property {number | null} gapYears targetYear と lastSameFamilyYear の差（無ければ null）
 * @property {number} requiredYears その科の推奨間隔（年・0 以上）
 * @property {string} familyKey 判定対象の科
 * @property {string} reason 利用者向けの日本語説明
 */

/**
 * 指定の区画に「ある科」を targetYear に植える場合の連作判定を返す。
 *
 * ルール:
 *   - requiredYears <= 0 の科は連作障害が出にくい ⇒ 常に ok（直近作付けがあれば reason で補足）。
 *   - 同科の直近作付け年を lastYear、gap = targetYear - lastYear とすると:
 *       gap < requiredYears  → ng（避けるべき窓の内側）
 *       gap === requiredYears → caution（目安ちょうど・もう1年で安心）
 *       gap > requiredYears  → ok
 *   - 同科の履歴が無ければ ok。
 *
 * @param {PastPlanting[]} past 同じ区画の過去作付け（順不同可）
 * @param {string} familyKey 植えようとする作物の科
 * @param {number} requiredYears その科の推奨間隔（年）。整数・負値は 0 とみなす
 * @param {number} targetYear 植えようとする年
 * @returns {RotationResult}
 */
export function evaluateRotation(past, familyKey, requiredYears, targetYear) {
  const req =
    Number.isInteger(requiredYears) && requiredYears > 0 ? requiredYears : 0;
  const list = Array.isArray(past) ? past : [];

  let lastYear = null;
  for (const p of list) {
    if (
      p &&
      p.familyKey === familyKey &&
      Number.isInteger(p.year) &&
      Number.isInteger(targetYear) &&
      // targetYear と同年の同科作付け（別区画記録）も衝突として数える（gap 0）。
      // 未来年（> targetYear）は無視する。
      p.year <= targetYear
    ) {
      if (lastYear === null || p.year > lastYear) lastYear = p.year;
    }
  }

  if (lastYear === null) {
    return {
      status: "ok",
      lastSameFamilyYear: null,
      gapYears: null,
      requiredYears: req,
      familyKey,
      reason: "この区画にこの科を植えた記録はありません。",
    };
  }

  const gap = targetYear - lastYear;

  if (req <= 0) {
    return {
      status: "ok",
      lastSameFamilyYear: lastYear,
      gapYears: gap,
      requiredYears: 0,
      familyKey,
      reason: "連作障害が出にくい科です。続けて植えても比較的安心です。",
    };
  }

  if (gap < req) {
    return {
      status: "ng",
      lastSameFamilyYear: lastYear,
      gapYears: gap,
      requiredYears: req,
      familyKey,
      reason: `${lastYear}年に同じ科を植えています。あと${req - gap}年あけるのがおすすめです（目安${req}年）。`,
    };
  }

  if (gap === req) {
    return {
      status: "caution",
      lastSameFamilyYear: lastYear,
      gapYears: gap,
      requiredYears: req,
      familyKey,
      reason: `前回の同じ科から目安の${req}年が経過しています。もう1年あけるとより安心です。`,
    };
  }

  return {
    status: "ok",
    lastSameFamilyYear: lastYear,
    gapYears: gap,
    requiredYears: req,
    familyKey,
    reason: `前回の同じ科の作付けから${gap}年あいています（目安${req}年）。`,
  };
}

/**
 * @typedef {Object} CropInfo
 * @property {string} familyKey
 * @property {number} rotationYears
 * @property {string} [nameJa]
 * @property {string} [familyJa]
 */

/**
 * @typedef {Object} BedRotation
 * @property {RotationStatus | "empty"} status 区画の判定（作付けなしは "empty"）
 * @property {number | null} lastSameFamilyYear
 * @property {number | null} gapYears
 * @property {number} requiredYears
 * @property {string} familyKey
 * @property {string} reason
 * @property {string | null} latestCropId 判定基準の最新作付けの作物 id
 * @property {number | null} latestYear 判定基準の最新作付けの年
 */

/**
 * 区画の「最新の作付け」に対する連作判定を返す。
 * 最新作付け（year が最大・同年なら配列後方）を基準年とし、それより前の同科履歴で判定する。
 * 照合は familyKey（科）で行い、必要年数はその最新作付け作物の rotationYears を用いる。
 * 作付けが1件も無ければ status="empty"。
 *
 * @param {{cropId: string, year: number}[]} plantings 区画の作付け（順不同）
 * @param {(cropId: string) => (CropInfo | undefined)} cropLookup cropId から科情報を引く関数
 * @returns {BedRotation}
 */
export function bedStatus(plantings, cropLookup) {
  const list = (Array.isArray(plantings) ? plantings : []).filter(
    (p) => p && typeof p.cropId === "string" && Number.isInteger(p.year),
  );

  if (list.length === 0) {
    return {
      status: "empty",
      lastSameFamilyYear: null,
      gapYears: null,
      requiredYears: 0,
      familyKey: "",
      reason: "まだ何も植えられていません。",
      latestCropId: null,
      latestYear: null,
    };
  }

  // 最新作付け（year 最大・同年は後勝ち＝配列の後方を採用）
  let latest = list[0];
  for (const p of list) {
    if (p.year >= latest.year) latest = p;
  }

  const info = cropLookup(latest.cropId);
  if (!info) {
    return {
      status: "empty",
      lastSameFamilyYear: null,
      gapYears: null,
      requiredYears: 0,
      familyKey: "",
      reason: "作物の情報が見つかりませんでした。",
      latestCropId: latest.cropId,
      latestYear: latest.year,
    };
  }

  // 最新作付けより前の同区画履歴に照らして、最新作付け年に植えた判定をする。
  const priorPlantings = list
    .filter((p) => p !== latest)
    .map((p) => {
      const ci = cropLookup(p.cropId);
      return ci ? { familyKey: ci.familyKey, year: p.year } : null;
    })
    .filter((p) => p !== null);

  const result = evaluateRotation(
    /** @type {PastPlanting[]} */ (priorPlantings),
    info.familyKey,
    info.rotationYears,
    latest.year,
  );

  return {
    ...result,
    latestCropId: latest.cropId,
    latestYear: latest.year,
  };
}

/** ステータスの深刻度（roll-up 用）。 */
const SEVERITY = /** @type {const} */ ({
  empty: 0,
  ok: 1,
  caution: 2,
  ng: 3,
});

/**
 * 複数ステータスのうち最も深刻なものを返す（菜園全体のサマリ用）。
 * 入力が空、または ok/empty のみなら最も深刻なものをそのまま返す。
 *
 * @param {(RotationStatus | "empty")[]} statuses
 * @returns {RotationStatus | "empty"}
 */
export function worstStatus(statuses) {
  const list = Array.isArray(statuses) ? statuses : [];
  let worst = /** @type {RotationStatus | "empty"} */ ("empty");
  for (const s of list) {
    if ((SEVERITY[s] ?? 0) > (SEVERITY[worst] ?? 0)) worst = s;
  }
  return worst;
}
