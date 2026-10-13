// 科別 連作ガイドの索引（/yasai/ka/）。
//
// /yasai/ka/<科>/ の URL を1階層削って辿った人の行き止まりをなくす入口。
// 科の一覧・年数・所属野菜はすべて familyPages.mjs の familyIndex() だけを見る
// ＝各科ページと食い違わない。サーバーコンポーネントなので静的HTMLに焼き込まれる。
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter, Breadcrumb } from "../../components/SiteChrome";
import { CropChips } from "../../components/GuideParts";
import { IconSprout } from "../../components/icons";
import {
  familyIndex,
  familyIndexBreadcrumbJsonLd,
  familyPath,
} from "../../lib/familyPages.mjs";
import { SITE_NAME } from "../../lib/reference.mjs";
import { OG_IMAGE } from "../../lib/og.mjs";

const index = familyIndex();

export const metadata: Metadata = {
  title: index.title,
  description: index.description,
  alternates: { canonical: index.url },
  // openGraph / twitter は layout のものと deep-merge されないため、画像も含めて全部書く。
  openGraph: {
    title: index.title,
    description: index.description,
    url: index.url,
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: index.title,
    description: index.description,
    images: [OG_IMAGE.url],
  },
};

export default function FamilyIndexPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(familyIndexBreadcrumbJsonLd(index)),
        }}
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
          <Breadcrumb
            trail={[
              { href: "/", label: "畑めぐり" },
              { href: "/yasai/", label: "野菜別 連作ガイド" },
            ]}
            current={index.heading}
          />
        </div>

        <section className="crop-lead">
          <div className="container container-narrow">
            <span className="eyebrow">CROP ROTATION BY FAMILY</span>
            <h1 style={{ wordBreak: "keep-all" }}>{index.heading}</h1>
            <p className="ref-lead">{index.lead}</p>
          </div>
        </section>

        <hr className="soil-divider no-print" aria-hidden="true" />

        <section className="crop-index" aria-labelledby="families-h">
          <div className="container container-narrow">
            <h2 id="families-h" className="visually-hidden">
              科の一覧
            </h2>
            {index.families.map((f) => (
              <section key={f.key} className="crop-family" aria-labelledby={`fam-${f.key}`}>
                <div className="crop-family-head">
                  <h3 id={`fam-${f.key}`}>
                    <span className="with-marker">
                      <span className="section-marker" aria-hidden="true">
                        <IconSprout />
                      </span>
                      <Link href={familyPath(f.key)}>{f.name}</Link>
                    </span>
                  </h3>
                  {/* 年数は色だけでなく必ず文字でも出す。科の代表値ではなく所属野菜の実際の幅。 */}
                  <span className={`ref-years is-${f.tier}`}>
                    {f.tier === "none" ? "続けて植えやすい科" : `あけたい年数 ${f.yearsLabel}`}
                  </span>
                </div>
                <CropChips items={f.crops} />
              </section>
            ))}
            <p className="crop-back">
              <Link href="/yasai/">← 野菜別 連作ガイドの一覧へ</Link>
            </p>
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
