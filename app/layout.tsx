import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
// 製品の "顔"（accent/neutral/radius/font/density）はここで上書きする。
import "./theme.css";
// 製品固有のコンポーネント CSS（区画グリッド・連作ステート・タイムライン等）。
import "./ui.css";
import { SITE_URL } from "./lib/site.mjs";
import { SITE_TITLE, SITE_DESCRIPTION, SITE_NAME } from "./lib/reference.mjs";

// ここに置くのは「どのページでも同じ」メタデータだけ。canonical と構造化データは
// ページ固有なので page.tsx が持つ（layout に置くと 404 ページにも出てしまう）。
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
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
