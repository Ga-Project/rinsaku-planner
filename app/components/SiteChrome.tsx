// サイト共通のヘッダー・フッター。
//
// トップと野菜ページで同じものを使う。以前はトップの page.tsx に直接書かれていて
// ページが増えると必ずずれるため、ここに1つだけ置く。
//
// 内部リンクは必ず next/link を使う: この製品は GitHub Pages のサブパス
// （/rinsaku-planner/）で配信されるので、素の <a href="/"> は basePath が付かず
// オリジンのルートへ飛んでしまう。Link は basePath を自動で前置する。
import Link from "next/link";
import type { ReactNode } from "react";
import { IconLeafMark } from "./icons";

export function SiteHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="site-header no-print">
      <div className="container">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            畑
          </span>
          <span>畑めぐり</span>
        </Link>
        {action}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer no-print">
      <div className="container">
        <p>
          連作障害の年数や相性は一般的な目安です。地域・品種・土壌の状態によって変わります。最終的な作付けはご自身の環境に合わせてご判断ください。
        </p>
        <p>記録はこの端末の中だけに保存され、外部には送信されません。</p>
        <p className="footer-leaf">
          <IconLeafMark aria-hidden="true" />© 畑めぐり
        </p>
      </div>
    </footer>
  );
}

/**
 * パンくず。視覚的な階層と、支援技術向けのランドマークを兼ねる。
 * 構造化データ（BreadcrumbList）は各ページが別途出す。
 */
export function Breadcrumb({
  trail,
  current,
}: {
  trail: { href: string; label: string }[];
  current: string;
}) {
  return (
    <nav className="crumbs no-print" aria-label="パンくず">
      <ol>
        {trail.map((t) => (
          <li key={t.href}>
            <Link href={t.href}>{t.label}</Link>
          </li>
        ))}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}
