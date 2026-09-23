// 畑めぐり（rinsaku-planner）— 保存・読み込み・エクスポート/インポートの純粋ロジック。
// localStorage アクセスは引数で注入できるようにし（テスト可能性）、検証・直列化は副作用なし。

export const STORAGE_KEY = "rinsaku-planner:v1";
export const CURRENT_VERSION = 1;

/** グリッドの寸法上限（極端な値を弾く）。 */
const MAX_GRID = 24;
/** 年の妥当範囲。 */
// 記録できる年の範囲。文面側も「記録できない年を名指ししない」ためにこの値を使う
// ので、ここが唯一の出典になるよう公開する。
export const MIN_YEAR = 1900;
export const MAX_YEAR = 3000;

/**
 * @typedef {import("./types").AppState} AppState
 */

/** 衝突しにくい id を生成する（crypto.randomUUID があれば優先）。 */
export function newId(prefix = "id") {
  try {
    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** 初期状態（区画なし）。 */
export function emptyState() {
  return {
    version: CURRENT_VERSION,
    gardens: [],
    activeGardenId: null,
    pro: false,
  };
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * 入力された年を、実際に記録できる値へ正す（整数化 + MIN_YEAR〜MAX_YEAR に丸め）。
 *
 * 読み込み時の sanitizePlanting は同じ丸めをするが、**入力時には誰も通していなかった**。
 * そのため `2026.5` や `20226` がそのまま判定へ流れ、判定年が非整数だと「同じ科の記録は
 * ありません」に落ちて、3行下に並ぶその記録を利用者が反証できる状態になっていた。
 * さらに保存値はリロードで黙って丸められ、植え付けOKが連作NGへ反転していた。
 * 入力境界（追加・プレビュー）をここに通すことで、保存される値と画面の判定が一致する。
 *
 * @template {number | null} F
 * @param {unknown} value 入力された年（非数・非整数・範囲外を受け取りうる）
 * @param {F} fallback 年として読めないときに返す値
 * @returns {number | F}
 */
export function normalizeYear(value, fallback = /** @type {any} */ (null)) {
  return clampInt(value, MIN_YEAR, MAX_YEAR, fallback);
}

/**
 * 画面の操作から作付け1件を作る。**画面から記録を作る経路は必ずここを通す。**
 *（取り込み経路は別方針で、sanitizePlanting が読めない年の記録を丸めずに捨てる）
 *
 * 正規化を画面側（入力フォーム）に置いていたときは、そこを外しても全ゲートが緑の
 * まま通った。描画を伴う検査はフォームの操作を起こせず、lib のテストは components を
 * 読まないためで、外れると「入力欄は丸めた年を表示し、保存されるのは生値」という
 * 最も気づきにくい形で戻る。年を正すのは保存する値の性質なので、書き込み境界の
 * 純粋関数に置いて、描画に依存せず固定できるようにする。
 *
 * @param {string} cropId
 * @param {unknown} year 入力された年（非整数・範囲外を受け取りうる）
 * @param {number} fallbackYear 年として読めないときに使う年
 * @returns {{id: string, cropId: string, year: number}}
 */
export function makePlanting(cropId, year, fallbackYear) {
  return { id: newId("p"), cropId, year: normalizeYear(year, fallbackYear) };
}

function sanitizePlanting(p) {
  if (!p || typeof p !== "object") return null;
  if (typeof p.cropId !== "string" || p.cropId.length === 0) return null;
  if (!Number.isFinite(p.year)) return null;
  const year = clampInt(p.year, MIN_YEAR, MAX_YEAR, null);
  if (year === null) return null;
  return {
    id: typeof p.id === "string" && p.id ? p.id : newId("p"),
    cropId: p.cropId,
    year,
    ...(typeof p.note === "string" && p.note ? { note: p.note } : {}),
  };
}

function sanitizeBed(b) {
  if (!b || typeof b !== "object") return null;
  const kind = b.kind === "planter" ? "planter" : "row";
  const plantings = Array.isArray(b.plantings)
    ? b.plantings.map(sanitizePlanting).filter((x) => x !== null)
    : [];
  return {
    id: typeof b.id === "string" && b.id ? b.id : newId("b"),
    label: typeof b.label === "string" ? b.label : "",
    kind,
    col: clampInt(b.col, 0, MAX_GRID - 1, 0),
    row: clampInt(b.row, 0, MAX_GRID - 1, 0),
    plantings,
  };
}

/**
 * 区画を一意な (col,row) セルに収める。重複したセルの区画は空きセルへ再配置する。
 * （import で同じセルに複数区画があると後勝ちで一方が不可視になるのを防ぐ。
 *  col/row は sanitizeBed で 0..MAX_GRID-1 に収まっている前提。）
 * @template {{col:number,row:number}} T
 * @param {T[]} beds sanitize 済みの区画
 * @param {number} cols 再配置時の折り返し幅
 * @returns {T[]} 一意セルに補正した区画
 */
function reflowBeds(beds, cols) {
  const width = Math.max(1, Math.min(cols, MAX_GRID));
  const occupied = new Set();
  const result = [];
  const toPlace = [];
  for (const b of beds) {
    const key = `${b.col},${b.row}`;
    if (!occupied.has(key)) {
      occupied.add(key);
      result.push(b);
    } else {
      toPlace.push(b);
    }
  }
  let idx = 0;
  for (const b of toPlace) {
    let c = 0;
    let r = 0;
    let key = "";
    do {
      c = idx % width;
      r = Math.floor(idx / width);
      key = `${c},${r}`;
      idx++;
    } while (occupied.has(key) && r < MAX_GRID - 1);
    occupied.add(key);
    result.push({ ...b, col: c, row: Math.min(r, MAX_GRID - 1) });
  }
  return result;
}

function sanitizeGarden(g) {
  if (!g || typeof g !== "object") return null;
  if (typeof g.id !== "string" || g.id.length === 0) return null;
  const rawBeds = Array.isArray(g.beds)
    ? g.beds.map(sanitizeBed).filter((x) => x !== null)
    : [];
  const wantCols = clampInt(g.cols, 1, MAX_GRID, 4);
  const wantRows = clampInt(g.rows, 1, MAX_GRID, 3);
  const beds = reflowBeds(rawBeds, wantCols);
  // グリッドは全区画が見えるよう、最大の col/row に合わせて広げる（圏外区画の不可視化を防ぐ）。
  let maxCol = wantCols - 1;
  let maxRow = wantRows - 1;
  for (const b of beds) {
    if (b.col > maxCol) maxCol = b.col;
    if (b.row > maxRow) maxRow = b.row;
  }
  return {
    id: g.id,
    name: typeof g.name === "string" && g.name ? g.name : "わたしの菜園",
    cols: clampInt(maxCol + 1, 1, MAX_GRID, 4),
    rows: clampInt(maxRow + 1, 1, MAX_GRID, 3),
    beds,
  };
}

/**
 * 任意のオブジェクトをアプリ状態として検証・正規化する。
 * 上位構造（オブジェクト・gardens 配列）が壊れていれば ok:false。
 * 個々の garden/bed/planting の不正は破棄して可能な限り復旧する。
 *
 * @param {unknown} obj
 * @returns {{ ok: boolean, state: AppState | null, error: string | null }}
 */
export function validateState(obj) {
  if (!obj || typeof obj !== "object") {
    return {
      ok: false,
      state: null,
      error: "データの形式が正しくありません。",
    };
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (!Array.isArray(o.gardens)) {
    return {
      ok: false,
      state: null,
      error: "菜園データ（gardens）が見つかりません。",
    };
  }

  const gardens = o.gardens.map(sanitizeGarden).filter((x) => x !== null);

  const ids = new Set(gardens.map((g) => g.id));
  let activeGardenId =
    typeof o.activeGardenId === "string" && ids.has(o.activeGardenId)
      ? o.activeGardenId
      : null;
  if (activeGardenId === null && gardens.length > 0) {
    activeGardenId = gardens[0].id;
  }

  /** @type {AppState} */
  const state = {
    version: CURRENT_VERSION,
    gardens,
    activeGardenId,
    pro: o.pro === true,
  };
  return { ok: true, state, error: null };
}

/**
 * 状態を保存用 JSON 文字列に直列化する（エクスポート用）。
 * @param {AppState} state
 * @returns {string}
 */
export function serialize(state) {
  return JSON.stringify(state, null, 2);
}

/**
 * エクスポートされた JSON テキストを取り込む。パース失敗・形式不正は ok:false。
 * @param {string} text
 * @returns {{ ok: boolean, state: AppState | null, error: string | null }}
 */
export function parseImport(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, state: null, error: "ファイルが空です。" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      state: null,
      error:
        "JSON として読み込めませんでした。書き出したファイルか確認してください。",
    };
  }
  return validateState(parsed);
}

/**
 * localStorage 等から状態を読み込む。壊れていれば emptyState を返す（落とさない）。
 * @param {{ getItem: (k: string) => (string | null) } | undefined} [storage]
 * @returns {AppState}
 */
export function loadState(storage) {
  const store =
    storage ??
    (typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : undefined);
  if (!store) return emptyState();
  let raw;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();
  const { ok, state } = parseImport(raw);
  return ok && state ? state : emptyState();
}

/**
 * 状態を localStorage 等へ保存する。失敗（容量超過・プライベートモード等）は false を返す。
 * @param {AppState} state
 * @param {{ setItem: (k: string, v: string) => void } | undefined} [storage]
 * @returns {boolean}
 */
export function saveState(state, storage) {
  const store =
    storage ??
    (typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : undefined);
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}
