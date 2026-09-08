// rinsaku-planner — UI 層で共有する型。純粋ロジック（lib/*.mjs）の JSDoc 形状と一致させる。

/** 作物の所属する科（連作判定の単位）。 */
export interface Family {
  /** ascii の安定キー（同じ科の作物が共有する）。 */
  key: string;
  /** 科の日本語名（例: ナス科）。 */
  nameJa: string;
  /** 同じ科を再び植えるまであける目安年数（0 = 連作障害が出にくい）。 */
  rotationYears: number;
}

/** 作物マスタの1件。 */
export interface Crop {
  id: string;
  nameJa: string;
  familyJa: string;
  familyKey: string;
  /** 同じ科を再び植えるまであける目安年数（0 = 連作障害が出にくい）。 */
  rotationYears: number;
  /** 種まき/植え付けの代表的な月（1–12）。 */
  sowMonths: number[];
  /** 収穫の代表的な月（1–12）。 */
  harvestMonths: number[];
  /** 相性の良い作物・ハーブ（日本語名）。 */
  companionGood: string[];
  /** 近くを避けたい作物（日本語名）。 */
  companionBad: string[];
  /** 栽培の一言メモ（空可）。 */
  note: string;
}

/** ある区画に植えた（植える）作物の記録。 */
export interface Planting {
  id: string;
  /** Crop.id への参照。 */
  cropId: string;
  /** 作付けの年（西暦）。 */
  year: number;
  /** 任意のメモ。 */
  note?: string;
}

/** 区画の種類（畝かプランターか）。 */
export type BedKind = "row" | "planter";

/** 畑/ベランダの1区画。グリッド上の (col, row) セルに対応する。 */
export interface Bed {
  id: string;
  label: string;
  kind: BedKind;
  /** グリッド上の列（0 始まり）。 */
  col: number;
  /** グリッド上の行（0 始まり）。 */
  row: number;
  /** この区画の作付け履歴。 */
  plantings: Planting[];
}

/** ひとつの菜園（グリッド + 区画群）。 */
export interface Garden {
  id: string;
  name: string;
  /** グリッドの列数。 */
  cols: number;
  /** グリッドの行数。 */
  rows: number;
  beds: Bed[];
}

/** localStorage / エクスポートに保存するアプリ全体の状態。 */
export interface AppState {
  version: number;
  gardens: Garden[];
  /** 表示中の菜園 id（無ければ null）。 */
  activeGardenId: string | null;
  /** 追加機能（PDF/印刷・複数の菜園・コンパニオン提案）のアンロック状態。 */
  pro: boolean;
}

/** 連作判定の結果状態。 */
export type RotationStatus = "ok" | "caution" | "ng";

/** evaluateRotation の戻り値。 */
export interface RotationResult {
  status: RotationStatus;
  lastSameFamilyYear: number | null;
  gapYears: number | null;
  requiredYears: number;
  familyKey: string;
  reason: string;
}

/** 区画単位の判定（作付けが無ければ status="empty"）。 */
export interface BedRotation extends Omit<RotationResult, "status"> {
  status: RotationStatus | "empty";
  /** 判定の基準になった最新作付けの作物 id（無ければ null）。 */
  latestCropId: string | null;
  latestYear: number | null;
}

/** 種まき適期が「今月」か「翌月から」か。 */
export type Timing = "now" | "soon";

/** suggestPlantings が返す1件（区画 × 暦月で絞り込んだ作付け候補）。 */
export interface Suggestion {
  cropId: string;
  nameJa: string;
  familyJa: string;
  familyKey: string;
  timing: Timing;
  /** 実際に植えることになる年。12月に見た「翌月」は翌年なので閲覧年と一致しない。 */
  targetYear: number;
  /** その区画にその科を targetYear に植えた場合の連作判定。 */
  status: RotationStatus;
  /** 同じ科を直近で植えた年（無ければ null）。 */
  lastSameFamilyYear: number | null;
  /** あと何年あければ植えられるか（status が ng のときだけ数値、他は null）。 */
  remainingYears: number | null;
  /** 判定の日本語説明。 */
  reason: string;
  /** その年すでにこの区画へ記録している同じ科の作付け（判定には影響しない注記）。 */
  sameYearRecord: { cropId: string; nameJa: string }[];
}

/** cropFocus が返す1件（「この野菜を植えられるか」を区画ごとに判定したもの）。 */
export interface FocusVerdict {
  bedId: string;
  /** 区画の表示名（利用者が空にできるので、画面側で既定文言を補う）。 */
  label: string;
  /** その区画にその野菜を植える場合の連作判定（判定エンジンの値をそのまま持つ）。 */
  status: RotationStatus;
  /** どの年に植える前提で判定したか。画面に必ず出す（判定は年に依存する）。 */
  targetYear: number;
  /** 同じ科を直近で植えた年（無ければ null）。 */
  lastSameFamilyYear: number | null;
  /** あと何年あければ植えられるか（status が ng のときだけ数値、他は null）。 */
  remainingYears: number | null;
  /** 判定の日本語説明。 */
  reason: string;
  /** その年すでにこの区画へ記録している同じ科の作付け（判定には影響しない注記）。 */
  sameYearRecord: { cropId: string; nameJa: string }[];
}
