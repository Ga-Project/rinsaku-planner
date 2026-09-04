// 野菜別 連作ガイドの索引。
//
// 59 種ぶんの読み物への入口を科ごとにまとめる。ここも本体（PlannerApp）とは別の
// サーバーコンポーネントで、静的HTMLに焼き込まれる＝プランナーを触る前でも、
// クローラにも、全野菜の名前とあける年数が読める。
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter, Breadcrumb } from "../components/SiteChrome";
import { IconSprout } from "../components/icons";
import {
  cropIndex,
  cropIndexUrl,
  cropSlugs,
  cropsByName,
} from "../lib/cropPages.mjs";
import { SITE_NAME } from "../lib/reference.mjs";
import { SITE_URL } from "../lib/site.mjs";
import { OG_IMAGE } from "../lib/og.mjs";

const TITLE = "野菜別 連作ガイド｜あける年数の一覧";
const DESCRIPTION =
  "トマト・ジャガイモ・キュウリ・キャベツなど家庭菜園でよく育てる野菜について、同じ場所に再び植えるまであける年数の目安を科ごとにまとめた一覧です。野菜の名前から、あとに植える野菜と相性の組み合わせを引けます。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: cropIndexUrl() },
  // openGraph / twitter は layout のものと deep-merge されないため、画像も含めて
  // ここで全部書き直す（落とすとカードがトップのものになる）。
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: cropIndexUrl(),
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

function breadcrumbJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "野菜別 連作ガイド",
        item: cropIndexUrl(),
      },
    ],
  };
}

export default function CropIndexPage() {
  const families = cropIndex();
  const byName = cropsByName();
  const total = cropSlugs().length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd()) }}
      />

      <a className="skip-link" href="#main">
        本文へスキップ
      </a>

      <SiteHeader
        action={
          <Link className="btn btn-primary" href="/#app">
            畑をつくる
          </Link>
        }
      />

      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <div className="container container-narrow">
          <Breadcrumb trail={[{ href: "/", label: "畑めぐり" }]} current="野菜別 連作ガイド" />
        </div>

        <section className="crop-lead">
          <div className="container container-narrow">
            <span className="eyebrow">CROP ROTATION INDEX</span>
            <h1 style={{ wordBreak: "keep-all" }}>野菜別 連作ガイド</h1>
            <p className="ref-lead">
              育てたい野菜の名前から、同じ場所に再び植えるまであける年数、あとに植えやすい野菜、相性のよい組み合わせを引けます。連作障害は野菜の名前ではなく「科」の単位で起きるため、科ごとにまとめています。全{total}種。
            </p>
          </div>
        </section>

        <hr className="soil-divider no-print" aria-hidden="true" />

        {/* 名前から引くという約束を果たす入口。科を知らないと辿れない構造だけだと
            リード文の言っていることと実際にできることが食い違う。 */}
        <section className="crop-index" aria-labelledby="byname-h">
          <div className="container container-narrow">
            <h2 id="byname-h">
              <span className="with-marker">
                <span className="section-marker" aria-hidden="true">
                  <IconSprout />
                </span>
                名前から探す
              </span>
            </h2>
            <p className="ref-lead">読み順に並べています。</p>
            {/* 形の符号（○/◇）は「勧める／避ける」が同じページに並ぶ詳細ページの
                ためのもの。ここは片方しか無いので付けない（意味の無い記号を足さない）。 */}
            <ul className="crop-chips">
              {byName.map((c) => (
                <li key={c.slug}>
                  <Link className="crop-chip" href={`/yasai/${c.slug}/`}>
                    <span className="crop-chip-name">{c.name}</span>
                    <span className="crop-chip-sub">{c.yearsLabel}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <hr className="soil-divider no-print" aria-hidden="true" />

        <section className="crop-index" aria-labelledby="byfam-h">
          <div className="container container-narrow">
            <h2 id="byfam-h">
              <span className="with-marker">
                <span className="section-marker" aria-hidden="true">
                  <IconSprout />
                </span>
                科から探す
              </span>
            </h2>
            <nav className="crop-jump" aria-label="科へ移動">
              <ul>
                {families.map((f) => (
                  <li key={f.key}>
                    <a href={`#fam-${f.key}`}>{f.nameJa}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>

        <section className="crop-index">
          <div className="container container-narrow">
            {families.map((f) => (
              <section key={f.key} className="crop-family" aria-labelledby={`fam-${f.key}`}>
                <div className="crop-family-head">
                  <h3 id={`fam-${f.key}`}>
                    <span className="with-marker">
                      <span className="section-marker" aria-hidden="true">
                        <IconSprout />
                      </span>
                      {f.nameJa}
                    </span>
                  </h3>
                  {/* 年数は色だけでなく必ず文字でも出す（色に意味を持たせない）。
                      出すのは科の代表値ではなく、下に並ぶ野菜の実際の範囲。 */}
                  <span className={`ref-years is-${f.tier}`}>
                    {f.tier === "none"
                      ? "続けて植えやすい科"
                      : `あけたい年数 ${f.yearsLabel}`}
                  </span>
                </div>
                {/* 作物ごとのあける年数を必ず併記する。科の代表値とずれる野菜
                    （ジャガイモ3年 / ナス科4年）があり、見出しの年数だけだと
                    一覧と中身が矛盾して見えるため。 */}
                <ul className="crop-chips">
                  {f.crops.map((c) => (
                    <li key={c.slug}>
                      <Link className="crop-chip" href={`/yasai/${c.slug}/`}>
                        <span className="crop-chip-name">{c.name}</span>
                        <span className="crop-chip-sub">{c.yearsLabel}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section className="reference-faq no-print">
          <div className="container container-narrow">
            <p className="ref-cta">
              <Link className="btn btn-primary btn-lg" href="/#app">
                区画に置いて計画をつくる
              </Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
