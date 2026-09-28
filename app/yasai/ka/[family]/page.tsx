// 科1つぶんの読み物（/yasai/ka/<key>/）。
//
// 連作障害は科の単位で起きるので、「ナス科 連作 何年」のように科の名前で探す人がいる。
// その受け皿を科ごとに1枚ずつ静的HTMLとして持つ。本文・メタデータ・構造化データは
// すべて familyPages.mjs の戻り値だけを見るので、画面と JSON-LD が食い違わない。
// 年数は科の代表値ではなく所属野菜ごとの値で出す（判定がその値を使うため）。
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader, SiteFooter, Breadcrumb } from "../../../components/SiteChrome";
import { Fact, CropChips, Heading } from "../../../components/GuideParts";
import {
  familySlugs,
  familyPage,
  familyPath,
  familyJsonLd,
  familyBreadcrumbJsonLd,
  otherFamilies,
} from "../../../lib/familyPages.mjs";
import { faqJsonLd, SITE_NAME } from "../../../lib/reference.mjs";
import { OG_IMAGE } from "../../../lib/og.mjs";

// static export では全 key をビルド時に確定させる。ページを持たない科は 404。
export function generateStaticParams() {
  return familySlugs().map((family: string) => ({ family }));
}
export const dynamicParams = false;

type Params = { params: { family: string } };

export function generateMetadata({ params }: Params): Metadata {
  const page = familyPage(params.family);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.url },
    // openGraph / twitter は layout のものと deep-merge されない。画像も含めて全部書く。
    openGraph: {
      title: page.title,
      description: page.description,
      url: page.url,
      type: "article",
      locale: "ja_JP",
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [OG_IMAGE.url],
    },
  };
}

export default function FamilyPage({ params }: Params) {
  const page = familyPage(params.family);
  if (!page) notFound();
  const others = otherFamilies(page.key);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(familyJsonLd(page)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(familyBreadcrumbJsonLd(page)),
        }}
      />
      {/* 画面に描画しているのと同じ FAQ 配列から作る＝構造化データにだけある Q&A は出ない。 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(page.faq)) }}
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
            current={page.name}
          />
        </div>

        <article>
          <section className="crop-lead">
            <div className="container container-narrow">
              <span className="eyebrow">科別 連作ガイド</span>
              {/* 強調は不変の「の連作」ではなく、そのページ固有の科名に置く。 */}
              <h1 style={{ wordBreak: "keep-all" }}>
                <span className="accent-text">{page.name}</span>
                <wbr />
                の連作
              </h1>
              <p className="ref-lead">{page.rotationLine}</p>

              <dl className="crop-facts">
                <Fact label="この科の野菜" value={`${page.count}種`} />
                {/* 科の代表値ではなく、所属野菜の実際の幅。ラベルで向きを言い切る。 */}
                <Fact
                  label="植えるまでにあけたい年数"
                  value={page.yearsLabel}
                  className={`ref-years is-${page.tier}`}
                />
              </dl>

              {page.directionNote ? (
                <p className="crop-note">
                  <span className="crop-note-label">年数の決まり方</span>
                  {page.directionNote}
                </p>
              ) : null}
            </div>
          </section>

          <hr className="soil-divider no-print" aria-hidden="true" />

          <section className="crop-section" aria-labelledby="members-h">
            <div className="container container-narrow">
              <Heading id="members-h">{page.headingCrops}</Heading>
              <p className="ref-lead">{page.leadCrops}</p>
              <CropChips items={page.crops} />
            </div>
          </section>

          <section className="crop-section" aria-labelledby="next-h">
            <div className="container container-narrow">
              <Heading id="next-h">{page.headingFollowUps}</Heading>
              <p className="ref-lead">{page.leadFollowUps}</p>
              <CropChips items={page.followUps} mark="good" />
            </div>
          </section>

          <section className="reference-faq no-print" aria-labelledby="faq-h">
            <div className="container container-narrow">
              <Heading id="faq-h">{page.headingFaq}</Heading>
              <div className="ref-faq">
                {page.faq.map((item: { q: string; a: string }, i: number) => (
                  <details key={item.q} className="ref-faq-item" open={i === 0}>
                    <summary>
                      <span className="ref-faq-q">{item.q}</span>
                    </summary>
                    <p className="ref-faq-a">{item.a}</p>
                  </details>
                ))}
              </div>

              <p className="ref-cta">
                <Link className="btn btn-primary btn-lg" href="/#app">
                  区画に置いて計画をつくる
                </Link>
              </p>
            </div>
          </section>

          <section className="crop-section no-print" aria-labelledby="others-h">
            <div className="container container-narrow">
              <Heading id="others-h">ほかの科の連作ガイド</Heading>
              <nav className="crop-jump" aria-labelledby="others-h">
                <ul>
                  {others.map((f: { key: string; name: string }) => (
                    <li key={f.key}>
                      <Link href={familyPath(f.key)}>{f.name}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <p className="crop-back">
                <Link href="/yasai/">← 野菜別 連作ガイドの一覧へ</Link>
              </p>
            </div>
          </section>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
