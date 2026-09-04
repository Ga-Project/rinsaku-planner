// 畑めぐり — ランディング（ヒーロー）＋ 区画プランナー本体 ＋ 読み物。
// ヒーローはサーバーコンポーネント、本体（PlannerApp）はクライアントの島。
import type { Metadata } from "next";
import { PlannerApp } from "./components/PlannerApp";
import { SiteHeader, SiteFooter } from "./components/SiteChrome";
import { ReferenceSection } from "./components/ReferenceSection";
import { SITE_URL } from "./lib/site.mjs";
import { faqJsonLd, appJsonLd } from "./lib/reference.mjs";

// canonical はページ固有。layout に置くと 404 ページがトップへの canonical を
// 継承してしまう（noindex と矛盾するシグナルになる）。
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

export default function Home() {
  return (
    <>
      {/* 構造化データもページ固有。FAQPage は ReferenceSection が描画しているのと
          同じ FAQ 配列から生成するので、画面に無い Q&A は入らない。 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />

      <a className="skip-link" href="#app">
        本文へスキップ
      </a>

      <SiteHeader
        action={
          <a className="btn btn-primary" href="#app">
            使ってみる
          </a>
        }
      />

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <section className="hero no-print">
          <div className="hero-scene" aria-hidden="true">
            <svg
              viewBox="0 0 1200 420"
              preserveAspectRatio="xMidYMax slice"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                className="hero-soil"
                x="0"
                y="300"
                width="1200"
                height="120"
                opacity="0.9"
              />
              <path
                className="hero-furrow"
                d="M0 320 Q300 296 600 320 T1200 320 V420 H0 Z"
                opacity="0.55"
              />
              <path
                className="hero-furrow"
                d="M0 352 Q300 332 600 352 T1200 352 V420 H0 Z"
                opacity="0.4"
              />
              <g
                className="hero-sprouts"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                opacity="0.85"
              >
                {[180, 420, 600, 780, 1020].map((x, i) => (
                  <g
                    key={x}
                    className={i === 2 ? "hero-sprout" : undefined}
                    transform={`translate(${x} 318)`}
                  >
                    <path d="M0 0 V-26" />
                    <path
                      className="hero-leaf"
                      d="M0 -14 C0 -24 -12 -28 -22 -28 C-22 -18 -10 -14 0 -14 Z"
                      opacity="0.9"
                    />
                    <path
                      className="hero-leaf"
                      d="M0 -18 C0 -28 12 -32 22 -32 C22 -22 10 -18 0 -18 Z"
                      opacity="0.75"
                    />
                  </g>
                ))}
              </g>
            </svg>
          </div>
          <div className="container">
            <span className="eyebrow">GARDEN ROTATION PLANNER</span>
            {/* 文節（区画ごとに、／連作を／ひと目で）でだけ折り返す。
                keep-all で日本語の任意改行を止め、<wbr> の位置のみ改行可にする
                （「連作」が連/作に割れるのを防ぐ）。 */}
            <h1 style={{ wordBreak: "keep-all" }}>
              区画ごとに、
              <wbr />
              <span className="accent-text">
                連作を
                <wbr />
                ひと目で
              </span>
              。
            </h1>
            <p className="hero-lead">
              畝やプランターを並べて、育てる野菜を置くだけ。同じ科を続けて植えていないか、色と印で教えてくれます。
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-lg" href="#app">
                畑をつくる
              </a>
              <a className="btn btn-secondary btn-lg" href="#guide">
                あけ年数の早見表
              </a>
            </div>
            <p className="hero-note">
              登録は不要です。計画はこの端末に保存され、すぐに使い始められます。
            </p>
          </div>
        </section>

        <hr className="soil-divider no-print" aria-hidden="true" />

        <section id="app" className="app-main">
          <div className="container">
            <PlannerApp />
          </div>
        </section>

        {/* 読み物（早見表・FAQ）。サーバー描画なので静的HTMLに焼き込まれ、
            プランナーを触る前でも連作の目安が読める。 */}
        <ReferenceSection />
      </main>

      <SiteFooter />
    </>
  );
}
