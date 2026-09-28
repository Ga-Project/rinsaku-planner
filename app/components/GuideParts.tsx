// 読み物ページ（野菜ページ・科ページ）が共有する部品。
//
// 野菜ページで作った部品を科ページでも使う。書き写すと、形の符号（○/◇）や
// 空値のガードを片方だけ直す、ということが起きるので1箇所に置く。
import Link from "next/link";
import { IconSprout } from "./icons";

/**
 * 事実の1行（科・あける年数・時期）。値が空の項目は行ごと出さない。
 * 値は必ず文字列で受け取る: JSX を受けると常に truthy になってガードが死ぬ
 * （空になり得るのは時期の2行だけなので、そこでガードが効かないと意味が無い）。
 */
export function Fact({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className="crop-fact">
      <dt>{label}</dt>
      <dd>
        <span className={className}>
          {icon}
          {value}
        </span>
      </dd>
    </div>
  );
}

/**
 * 野菜名の並び。マスタにある野菜だけリンクにする（花・ハーブ類はテキストのまま）。
 *
 * mark は「勧めている並び」と「間をあけたい並び」を、チップ単体を見ただけで
 * 区別するための形の符号。1ページに勧める並びと避ける並びが同居するときに付ける。
 * 形は節見出しの ○ / ◇ と同じ語彙にそろえ、色には意味を持たせない。
 * 記号は装飾なので読み上げには載せない（意味は見出しと aria-labelledby が担保）。
 * 勧めも避けもしない並び（科ページの所属一覧）には付けない＝意味の無い記号を足さない。
 */
export function CropChips({
  items,
  mark,
}: {
  items: { name: string; slug?: string; yearsLabel?: string }[];
  mark?: "good" | "avoid";
}) {
  return (
    <ul className={mark ? `crop-chips is-${mark}` : "crop-chips"}>
      {items.map((c) => (
        <li key={c.name}>
          {c.slug ? (
            <Link className="crop-chip" href={`/yasai/${c.slug}/`}>
              <span className="crop-chip-name">{c.name}</span>
              {c.yearsLabel ? (
                <span className="crop-chip-sub">{c.yearsLabel}</span>
              ) : null}
            </Link>
          ) : (
            <span className="crop-chip is-plain">
              <span className="crop-chip-name">{c.name}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id}>
      <span className="with-marker">
        <span className="section-marker" aria-hidden="true">
          <IconSprout />
        </span>
        {children}
      </span>
    </h2>
  );
}
