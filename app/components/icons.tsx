// 畑めぐり — inline SVG アイコン。色覚に依存しないよう連作ステートは「形」で区別する。
// すべて currentColor 連動・aria-hidden（意味は隣接する可視テキストで伝える）。
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** 連作NG = 八角形（停止標識）＋中央の横バー。 */
export function IconStop(props: IconProps) {
  return (
    <Base {...props}>
      <polygon points="8.5,3 15.5,3 21,8.5 21,15.5 15.5,21 8.5,21 3,15.5 3,8.5" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </Base>
  );
}

/** 注意 = 三角形（警告）＋感嘆符。 */
export function IconWarn(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3 L22 20 H2 Z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** OK = 円＋チェック。 */
export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 L11 15.5 L16.5 9" />
    </Base>
  );
}

/** 未設定 = 破線の円（プレースホルダ）。 */
export function IconDashed(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </Base>
  );
}

/** 追加（プラス）。 */
export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Base>
  );
}

/** 芽生え（空状態・ブランド）。 */
export function IconSprout(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21 V11" />
      <path d="M12 13 C12 8 8 6 4 6 C4 11 8 13 12 13 Z" />
      <path d="M12 11 C12 7 15 5 19 5 C19 9 15 11 12 11 Z" />
    </Base>
  );
}

/** 書き出し（ダウンロード）。 */
export function IconDownload(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3 V15" />
      <path d="M7 11 L12 16 L17 11" />
      <path d="M4 20 H20" />
    </Base>
  );
}

/** 取り込み（アップロード）。 */
export function IconUpload(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 16 V4" />
      <path d="M7 8 L12 3 L17 8" />
      <path d="M4 20 H20" />
    </Base>
  );
}

/** 印刷。 */
export function IconPrint(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 9 V3 H18 V9" />
      <path d="M6 18 H4 a2 2 0 0 1 -2 -2 V11 a2 2 0 0 1 2 -2 H20 a2 2 0 0 1 2 2 V16 a2 2 0 0 1 -2 2 H18" />
      <rect x="6" y="14" width="12" height="7" />
    </Base>
  );
}

/** 削除（ゴミ箱）。 */
export function IconTrash(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7 H20" />
      <path d="M9 7 V4 H15 V7" />
      <path d="M6 7 L7 20 H17 L18 7" />
    </Base>
  );
}

/** 応援（ハート）。 */
export function IconHeart(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 20 C12 20 3 14 3 8.5 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 21 8.5 C21 14 12 20 12 20 Z" />
    </Base>
  );
}

/** 芽（区画に作物が植わっている印・科色で tint・装飾）。 */
export function IconSeedling(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21 V10" />
      <path d="M12 12 C12 7.5 8.5 5.5 4.5 5.5 C4.5 10 8 12 12 12 Z" />
      <path d="M12 10 C12 6.5 14.8 4.5 18.5 4.5 C18.5 8.5 15.2 10.2 12 10 Z" />
    </Base>
  );
}

/** 葉（footer / brand のさりげない印）。 */
export function IconLeafMark(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 4 C9 5 4 11 4 20 C13 20 19 14 20 4 Z" />
      <path d="M16 8 C12 11 9 14.5 7 18" />
    </Base>
  );
}
