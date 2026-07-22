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

/** 編集パネルに出す、判定理由つきのバナー。 */
export function Verdict({
  status,
  reason,
}: {
  status: AnyStatus;
  reason: string;
}) {
  if (status === "empty") return null;
  const m = META[status];
  const Icon = m.Icon;
  return (
    <p className={`verdict ${m.cls}`} role="status">
      <Icon />
      <span>{reason}</span>
    </p>
  );
}
