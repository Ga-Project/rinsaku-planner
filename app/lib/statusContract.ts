// バッジ・バナーが取りうる状態の正本。
//
// 状態を1つ増やしたとき（ok から落とす partial）、verdictCopy の JSDoc だけを直しても
// 誰も照合しないので、宣言が黙って嘘に戻れる。実測で、3箇所から `| "partial"` を
// 消しても typecheck・lint・全テストが緑のまま通った。消費側（status-ui）が独自に
// 広い union を宣言しており、狭い union は広い union に代入できてしまうため。
//
// ここで「lib が返す型」と「画面が受ける型」が**厳密に同じ**であることを固定する。
// 型だけの検査なので実行時の重さはゼロ、依存も増やさない。
import type { bedBadgeStatus, panelVerdicts } from "./verdictCopy.mjs";
import type { RotationStatus } from "./types";

/** 区画バッジ・区画バナーが取りうる状態。 */
export type AnyStatus = RotationStatus | "empty" | "unknown" | "partial";

/** A と B が厳密に同じ集合のときだけ true になる。片方が広いと never になる。 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

type Panel = ReturnType<typeof panelVerdicts>;

const badgeMatches: Exact<ReturnType<typeof bedBadgeStatus>, AnyStatus> = true;
const panelBadgeMatches: Exact<Panel["badgeStatus"], AnyStatus> = true;
const bannerMatches: Exact<NonNullable<Panel["banner"]>["status"], AnyStatus> = true;

void badgeMatches;
void panelBadgeMatches;
void bannerMatches;
