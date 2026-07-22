// 畑めぐり — ランディング（ヒーロー）＋ 区画プランナー本体。
// ヒーローはサーバーコンポーネント、本体（PlannerApp）はクライアントの島。
import { PlannerApp } from "./components/PlannerApp";
import { IconLeafMark } from "./components/icons";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#app">
        本文へスキップ
      </a>

      <header className="site-header no-print">
        <div className="container">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              畑
            </span>
            <span>畑めぐり</span>
          </a>
          <a className="btn btn-primary" href="#app">
            使ってみる
          </a>
        </div>
      </header>

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
              <a className="btn btn-secondary btn-lg" href="#app">
                使い方を見る
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
      </main>

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
    </>
  );
}
