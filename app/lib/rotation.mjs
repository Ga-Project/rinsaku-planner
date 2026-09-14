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
 * @property {number | null} nearestSameFamilyYear 同じ科を植えた（植える予定の）年のうち targetYear に最も近いもの（無ければ null）
 * @property {number | null} gapYears targetYear と nearestSameFamilyYear の間隔（絶対値・無ければ null）
 * @property {number | null} nextPlantableYear どの作付けからも目安の年数があく最初の年（status が ng のときだけ数値）
 * @property {number} requiredYears その科の推奨間隔（年・0 以上）
 * @property {string} familyKey 判定対象の科
 * @property {string} reason 利用者向けの日本語説明
 */

/**
 * 指定の区画に「ある科」を targetYear に植える場合の連作判定を返す。
 *
 * ■ 間隔は時間対称に数える（ここが判定の芯）
 *   同じ科を 2026年 と 2027年 に置けば、どちらから見ても間隔は1年で、
 *   困るのは両方である。したがって過去の作付けだけでなく、**targetYear より
 *   後に記録されている作付け（翌季の計画）も同じ間隔として数える**。
 *   年の入力は 1900〜3000 を受けるので、先の季節の計画を入れておくのは
 *   この製品の正常な使い方であり、それを判定から外すと
 *     - 2027年にトマトを計画してある区画に、2026年のトマトを「そのまま植えられます」と勧める
 *     - 記録した瞬間、同じ区画が連作NGに変わる
 *   という、製品が自分の勧めを自分で否定する状態になる。
 *
 * ルール:
 *   - requiredYears <= 0 の科は連作障害が出にくい ⇒ 常に ok（近い作付けがあれば reason で補足）。
 *   - 同科の作付けのうち targetYear に最も近いものを取り、gap = |targetYear - その年| とすると:
 *       gap < requiredYears  → ng（避けるべき窓の内側）
 *       gap === requiredYears → caution（目安ちょうど・もう1年で安心）
 *       gap > requiredYears  → ok
 *   - 間隔が同じ過去と未来が並ぶときは過去を採る（すでに起きた事実を先に言う）。
 *   - 同科の履歴が無ければ ok。
 *
 * @param {PastPlanting[]} past 同じ区画の作付け（順不同可・targetYear より後のものを含んでよい）
 * @param {string} familyKey 植えようとする作物の科
 * @param {number} requiredYears その科の推奨間隔（年）。整数・負値は 0 とみなす
 * @param {number} targetYear 植えようとする年
 * @returns {RotationResult}
 */
export function evaluateRotation(past, familyKey, requiredYears, targetYear) {
  const req =
    Number.isInteger(requiredYears) && requiredYears > 0 ? requiredYears : 0;
  const list = Array.isArray(past) ? past : [];

  // この区画にある同じ科の作付けの年（昇順）。文面と待ち年数の計算で共用する。
  /** @type {number[]} */
  const sameFamilyYears = Number.isInteger(targetYear)
    ? list
        .filter((p) => p && p.familyKey === familyKey && Number.isInteger(p.year))
        .map((p) => p.year)
        .sort((a, b) => a - b)
    : [];

  /** @type {{year: number, gap: number} | null} */
  let nearest = null;
  if (Number.isInteger(targetYear)) {
    for (const p of list) {
      if (!p || p.familyKey !== familyKey || !Number.isInteger(p.year)) continue;
      const gap = Math.abs(targetYear - p.year);
      if (
        nearest === null ||
        gap < nearest.gap ||
        // 同じ間隔なら過去を採る。
        (gap === nearest.gap && p.year <= targetYear && nearest.year > targetYear)
      ) {
        nearest = { year: p.year, gap };
      }
    }
  }

  if (nearest === null) {
    return {
      status: "ok",
      nearestSameFamilyYear: null,
      gapYears: null,
      nextPlantableYear: null,
      requiredYears: req,
      familyKey,
      reason: "同じ科の作付けの記録はありません。",
    };
  }

  const { year, gap } = nearest;
  const base = {
    nearestSameFamilyYear: year,
    gapYears: gap,
    nextPlantableYear: /** @type {number | null} */ (null),
    requiredYears: req,
    familyKey,
  };

  // 「あと何年あければよいか」は、その年が **他の同じ科の作付けで塞がっていない**
  // ところまで進めて数える。直近の1件だけを見て req - gap で出すと、
  // たとえば 2024年 と 2028年 に記録があって 2026年に植えようとした場合
  // 「あと2年」＝2028年 を指すが、その 2028年 には同じ科が入っている。
  // 勧めた年を製品が即座に否定することになるので、実際に置ける年まで送る。
  /**
   * 次に置ける年までの年数を数える。
   *
   * 直近の1件から `目安 - 間隔` で出すと、その年が別の同じ科の作付けで
   * 塞がっていることがある（2024年と2028年に記録があり、目安4年で
   * 2026年に植えようとすると「あと2年」＝塞がっている2028年を指す）。
   * 勧めた年を製品が即座に否定することになるので、実際に置ける年まで送る。
   *
   * 最も遠い記録を req 年またいだ年は必ず全ての記録から req 以上離れるので、
   * 探索は `limit` 以内で必ず解に当たる（1から昇順なので最初の解が最小）。
   */
  const findNextPlantableYear = () => {
    let limit = req;
    for (const y of sameFamilyYears) {
      const d = Math.abs(y - targetYear);
      if (d > limit - req) limit = d + req;
    }
    for (let k = 1; k <= limit; k++) {
      const y = targetYear + k;
      if (sameFamilyYears.every((r) => Math.abs(y - r) >= req)) return y;
    }
    // limit の取り方から到達しない。
    return targetYear + req;
  };

  if (req <= 0) {
    return {
      ...base,
      requiredYears: 0,
      status: "ok",
      reason: "連作障害が出にくい科です。続けて植えても比較的安心です。",
    };
  }

  if (gap < req) {
    const next = findNextPlantableYear();
    return {
      ...base,
      status: "ng",
      nextPlantableYear: next,
      // 名指しするのは、いちばん近い作付けの年と、置ける年の2つだけ。
      // 年を列挙しないのは、記録件数に対して文が伸びるのを避けるため
      // （検算に要る全件は、同じパネルの「作付けの記録」に並んでいる）。
      // 「どの作付けからも」が、その一覧を見るよう促す語。
      reason: `${year}年に同じ科の作付けがあります。どの作付けからも目安の${req}年あくのは${next}年からです。`,
    };
  }

  if (gap === req) {
    return {
      ...base,
      status: "caution",
      // 助言は入れない。衝突相手が判定年より後にあるとき「もう1年あける」は
      // 間隔を縮めるので必ず避けたい年に落ちる。役割はバッジと群見出しが持つ。
      reason: `${year}年に同じ科の作付けがあります。間隔は目安の${req}年ちょうどです。`,
    };
  }

  return {
    ...base,
    status: "ok",
    reason: `${year}年に同じ科の作付けがあります。間隔は${gap}年です（目安${req}年）。`,
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
 * @property {number | null} nearestSameFamilyYear
 * @property {number | null} gapYears
 * @property {number | null} nextPlantableYear
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
      nearestSameFamilyYear: null,
      gapYears: null,
      nextPlantableYear: null,
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
      nearestSameFamilyYear: null,
      gapYears: null,
      nextPlantableYear: null,
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
    // ここは「すでに記録した作付け」の判定で、その作付け自身を履歴から外して
    // 判定している。素の文（同じ科の作付けの記録はありません）をそのまま出すと、
    // 「すでに記録した作付けの判定 ── 2027年 トマト」という見出しの直下で
    // 「記録はありません」と言うことになるので、ここだけ言い換える。
    reason:
      result.nearestSameFamilyYear === null
        ? "前後の年に、同じ科の作付けはほかにありません。"
        : result.reason,
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
