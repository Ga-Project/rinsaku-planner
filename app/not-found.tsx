// rinsaku-planner — 404 ページ（web テンプレ）。
// Next 既定の英語・無スタイル 404 ではなく、共通デザイン基盤を当てた日本語の 404。
// static export（output: "export"）では out/404.html に書き出され、GitHub Pages の 404 になる。
// page.tsx と同じランドマーク（header / main / footer）・h1 は1つ・skip-link を持つ。

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "./components/SiteChrome";

export const metadata: Metadata = {
  title: "ページが見つかりません — 畑めぐり",
  // 404 は検索インデックス対象外にする（誤ってインデックスされないように）。
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>

      {/* 内部リンクは next/link 経由でしか basePath が付かない。素の href="/" は
          サブパス配信で配信オリジンのルート（＝製品の外）へ飛ぶ。
          static export では存在しない URL の受け皿はこの 404.html だけなので、
          ここのリンクが外に出ていると打ち間違えた利用者を必ず取り逃がす。 */}
      <SiteHeader />

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <section className="hero">
          <div className="container container-narrow">
            <span className="badge badge-accent">404</span>
            <h1 style={{ marginTop: "var(--sp-4)" }}>
              ページが<span className="accent-text">見つかりません</span>
            </h1>
            <p className="hero-lead">
              お探しのページは見つかりませんでした。移動・削除されたか、URL
              が誤っている可能性があります。
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/">
                ホームへ戻る
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>© 畑めぐり</p>
        </div>
      </footer>
    </>
  );
}
