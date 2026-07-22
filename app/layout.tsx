import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
// 製品の "顔"（accent/neutral/radius/font/density）はここで上書きする。
import "./theme.css";
// 製品固有のコンポーネント CSS（区画グリッド・連作ステート・タイムライン等）。
import "./ui.css";

const TITLE = "畑めぐり｜家庭菜園の輪作・連作プランナー";
const DESCRIPTION =
  "畝やプランターの区画を並べ、育てる野菜を置くだけ。同じ科を続けて植える連作障害を色と印でひと目で判定し、12か月の作付けスケジュールを管理できる家庭菜園プランナー。登録不要・ブラウザですぐ使えます。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "ja_JP",
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
