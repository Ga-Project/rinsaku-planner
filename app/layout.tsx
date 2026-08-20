import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
// 製品の "顔"（accent/neutral/radius/font/density）はここで上書きする。
import "./theme.css";
// 製品固有のコンポーネント CSS（区画グリッド・連作ステート・タイムライン等）。
import "./ui.css";
import { faqJsonLd } from "./lib/reference.mjs";

const TITLE = "畑めぐり｜家庭菜園の輪作・連作プランナー";
const DESCRIPTION =
  "畝やプランターの区画を並べ、育てる野菜を置くだけ。同じ科を続けて植える連作障害を色と印でひと目で判定し、12か月の作付けスケジュールを管理できる家庭菜園プランナー。登録不要・ブラウザですぐ使えます。";

// 公開URL。プロジェクトページ配信のため末尾スラッシュ込みの絶対URLで固定する。
// 将来ルート配信（独自ドメイン）へ移す場合、変更点はこの定数と sitemap.ts の2箇所。
const SITE_URL = "https://ga-project.github.io/rinsaku-planner/";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // 同一内容に複数URL（末尾スラッシュ有無など）で到達しうるため正規URLを明示する。
  alternates: { canonical: SITE_URL },
  keywords: [
    "連作障害",
    "輪作",
    "家庭菜園",
    "菜園プランナー",
    "作付け計画",
    "ナス科",
    "アブラナ科",
    "ウリ科",
    "マメ科",
    "コンパニオンプランツ",
    "畝",
    "プランター",
    "野菜づくり",
    "栽培計画",
    "登録不要",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "ja_JP",
    siteName: "畑めぐり",
    url: SITE_URL,
    images: [
      {
        url: "og.png", // metadataBase 起点で絶対URLに解決される
        width: 1200,
        height: 630,
        alt: "畑めぐり — 区画ごとに連作をひと目で判定する家庭菜園の輪作プランナー",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["og.png"],
  },
};

// 無料ツールであることと、扱っている主題を検索エンジンに明示する。
// FAQPage 側は lib/reference.mjs の FAQ（＝画面に描画しているのと同じ配列）から
// 生成するので、構造化データにだけ存在する Q&A は原理的に発生しない。
const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "畑めぐり",
  url: SITE_URL,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  inLanguage: "ja",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  description: DESCRIPTION,
  featureList: [
    "畝・プランターの区画を並べて作付けを記録",
    "同じ科の連作を色と印で判定",
    "12か月の作付けスケジュール表示",
    "コンパニオンプランツの相性表示",
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
        />
        {children}
        {/* analytics: GoatCounter（cookieless・秘密キー不要・公開タグ）。next/script で afterInteractive 注入。 */}
        <Script
          data-goatcounter="https://ga-project.goatcounter.com/count"
          src="https://gc.zgo.at/count.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
