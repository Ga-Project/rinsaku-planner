// 野菜1件ぶんの読み物（/yasai/<id>/）。
//
// 「トマト 連作 何年」「ジャガイモ のあと 何を植える」のように、人は必ず野菜の名前で
// 探す。その受け皿を野菜ごとに1枚ずつ静的HTMLとして持つ。本文・メタデータ・構造化
// データはすべて cropPages.mjs の戻り値だけを見るので、画面と JSON-LD が食い違わない。
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader, SiteFooter, Breadcrumb } from "../../components/SiteChrome";
import { IconSeedling, IconClock } from "../../components/icons";
import { Fact, CropChips, Heading } from "../../components/GuideParts";
import {
  cropSlugs,
  cropPage,
  cropJsonLd,
  cropBreadcrumbJsonLd,
} from "../../lib/cropPages.mjs";
import { faqJsonLd, SITE_NAME } from "../../lib/reference.mjs";
import { OG_IMAGE } from "../../lib/og.mjs";
import { hasFamilyPage, familyPath } from "../../lib/familyPages.mjs";

// static export では全 slug をビルド時に確定させる。マスタに無い slug は 404。
export function generateStaticParams() {
  return cropSlugs().map((slug: string) => ({ slug }));
}
export const dynamicParams = false;

type Params = { params: { slug: string } };

export function generateMetadata({ params }: Params): Metadata {
  const page = cropPage(params.slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.url },
    // openGraph / twitter は layout のものと deep-merge されない。ここで定義した
    // 時点で layout 側の images は丸ごと落ちるので、画像も含めて全部書き直す
    // （落とすと59ページ全部がトップと同じカードで共有される）。
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

export default function CropDetailPage({ params }: Params) {
  const page = cropPage(params.slug);
  if (!page) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cropJsonLd(page)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(cropBreadcrumbJsonLd(page)),
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
              <span className="eyebrow">{page.familyJa}</span>
              {/* 強調は 59 ページで不変の「の連作」ではなく、そのページ固有の
                  野菜名に置く（トップの h1 と同じで、意味のある側を光らせる）。 */}
              <h1 style={{ wordBreak: "keep-all" }}>
                <span className="accent-text">{page.name}</span>
                <wbr />
                の連作
              </h1>
              <p className="ref-lead">{page.rotationLine}</p>

              {/* 事実は表ではなく定義リスト。狭い画面で崩れず、読み上げでも対になる。 */}
              <dl className="crop-facts">
                <Fact label="科" value={page.familyJa} />
                {/* 年数の向きを取り違えないよう、ラベルで「植えるまでに」と言い切る。 */}
                <Fact
                  label="植えるまでにあけたい年数"
                  value={page.yearsLabel}
                  className={`ref-years is-${page.tier}`}
                />
                <Fact
                  label="種まき・植え付け"
                  value={page.sowLabel}
                  className="crop-months"
                  icon={<IconSeedling aria-hidden="true" />}
                />
                <Fact
                  label="収穫"
                  value={page.harvestLabel}
                  className="crop-months"
                  icon={<IconClock aria-hidden="true" />}
                />
              </dl>

              {page.note ? (
                <p className="crop-note">
                  <span className="crop-note-label">栽培メモ</span>
                  {page.note}
                </p>
              ) : null}
            </div>
          </section>

          <hr className="soil-divider no-print" aria-hidden="true" />

          <section className="crop-section" aria-labelledby="same-h">
            <div className="container container-narrow">
              <Heading id="same-h">{page.headingSameFamily}</Heading>
              <p className="ref-lead">{page.leadSameFamily}</p>
              {page.sameFamily.length > 0 ? (
                <CropChips items={page.sameFamily} mark="avoid" />
              ) : (
                <p className="crop-empty">
                  {`この一覧に載っている${page.familyInline}の野菜は${page.name}だけです。`}
                </p>
              )}
              {/* 科の単位で探す人の受け皿へ。1種しかない科にはページが無いので張らない
                  （張ると 404 に落ちる）。 */}
              {hasFamilyPage(page.familyKey) ? (
                <p className="crop-back">
                  <Link href={familyPath(page.familyKey)}>
                    {`${page.familyInline}の野菜ごとの年数を一覧で見る →`}
                  </Link>
                </p>
              ) : null}
            </div>
          </section>

          <section className="crop-section" aria-labelledby="next-h">
            <div className="container container-narrow">
              <Heading id="next-h">{page.headingFollowUps}</Heading>
              <p className="ref-lead">{page.leadFollowUps}</p>
              <CropChips items={page.followUps} mark="good" />
            </div>
          </section>

          <section className="crop-section" aria-labelledby="comp-h">
            <div className="container container-narrow">
              <Heading id="comp-h">{page.headingCompanions}</Heading>
              <div className="crop-companions">
                <div>
                  <h3 className="crop-sub is-good">相性がよいとされる</h3>
                  <CropChips items={page.companionGood} mark="good" />
                </div>
                {page.companionBad.length > 0 ? (
                  <div>
                    <h3 className="crop-sub is-bad">近くに植えないほうがよい</h3>
                    <CropChips items={page.companionBad} mark="avoid" />
                  </div>
                ) : null}
              </div>
              <p className="crop-note">
                組み合わせは害虫を寄せつけにくくしたり生育を助けたりするものです。土に残った病原菌やセンチュウを消すものではないので、連作を避けることが主、組み合わせは補助と考えてください。
              </p>
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
                  {page.name}を区画に置いてみる
                </Link>
              </p>
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
