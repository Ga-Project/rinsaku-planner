// 連作ステートの表示部品。色＋アイコン形状＋テキストの三重符号化で色覚に依存しない。
import type { RotationStatus } from "../lib/types";
import { IconStop, IconWarn, IconCheck, IconDashed } from "./icons";

type AnyStatus = RotationStatus | "empty";

interface Meta {
  label: string;
  cls: string;
  Icon: (props: { className?: string }) => JSX.Element;
}

const META: Record<AnyStatus, Meta> = {
  ng: { label: "連作NG", cls: "is-ng", Icon: IconStop },
  caution: { label: "間隔に注意", cls: "is-caution", Icon: IconWarn },
  ok: { label: "植え付けOK", cls: "is-ok", Icon: IconCheck },
  empty: { label: "未設定", cls: "is-empty", Icon: IconDashed },
};

/** 区画セルに出す小さなステートバッジ。 */
export function StateBadge({ status }: { status: AnyStatus }) {
  const m = META[status];
  const Icon = m.Icon;
  return (
    <span className={`bed-state ${m.cls}`}>
      <Icon />
      <span>{m.label}</span>
    </span>
  );
}

/**
 * 編集パネルに出す、判定つきのバナー。
 * 文は verdictCopy の合成関数が組み立てたものを受け取るだけで、ここでは作らない
 * （同じパネルに上下で並ぶ他の面と文がずれるのを防ぐ）。
 */
export function Verdict({
  status,
  text,
  live = true,
}: {
  status: AnyStatus;
  text: string;
  /**
   * 読み上げに変更を通知するか。既定は通知する（区画の判定は作付けを変えたときだけ動く）。
   * 年入力のように1打鍵ごとに再計算される面では false にする。途中の値でも文が成立して
   * しまい、長文が繰り返し読まれるため。画面上は見えているので情報は失われない。
   */
  live?: boolean;
}) {
  if (status === "empty") return null;
  const m = META[status];
  const Icon = m.Icon;
  return (
    <p className={`verdict ${m.cls}`} role={live ? "status" : undefined}>
      <Icon />
      <span>{text}</span>
    </p>
  );
}
