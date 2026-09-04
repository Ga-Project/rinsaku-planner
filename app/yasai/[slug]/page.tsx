// 野菜1件ぶんの読み物（/yasai/<id>/）。
//
// 「トマト 連作 何年」「ジャガイモ のあと 何を植える」のように、人は必ず野菜の名前で
// 探す。その受け皿を野菜ごとに1枚ずつ静的HTMLとして持つ。本文・メタデータ・構造化
// データはすべて cropPages.mjs の戻り値だけを見るので、画面と JSON-LD が食い違わない。
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader, SiteFooter, Breadcrumb } from "../../components/SiteChrome";
import { IconSprout, IconSeedling, IconClock } from "../../components/icons";
import {
  cropSlugs,
  cropPage,
  cropJsonLd,
  cropBreadcrumbJsonLd,
} from "../../lib/cropPages.mjs";
import { faqJsonLd, SITE_NAME } from "../../lib/reference.mjs";

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
    openGraph: {
      title: page.title,
      description: page.description,
      url: page.url,
      type: "article",
      locale: "ja_JP",
      siteName: SITE_NAME,
    },
  };
}

/** 事実の1行（科・あける年数・時期）。値が無い項目は行ごと出さない。 */
function Fact({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  if (!value && !children) return null;
  return (
    <div className="crop-fact">
      <dt>{label}</dt>
      <dd>{children ?? value}</dd>
    </div>
  );
}

/** 野菜名の並び。マスタにある野菜だけリンクにする（花・ハーブ類はテキストのまま）。 */
function CropChips({
  items,
  tone,
}: {
  items: { name: string; slug?: string; yearsLabel?: string }[];
  tone: "same" | "next" | "good" | "bad";
}) {
  return (
    <ul className={`crop-chips is-${tone}`}>
      {items.map((c) => (
        <li key={c.name}>
          {c.slug ? (
            <Link className="crop-chip" href={`/yasai/${c.slug}/`}>
              <span className="crop-chip-name">{c.name}</span>
              {c.yearsLabel ? (
                <span className="crop-chip-sub">{c.yearsLabel}</span>
              ) : null}
            </Link>
          ) : (
            <span className="crop-chip is-plain">
              <span className="crop-chip-name">{c.name}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id}>
      <span className="with-marker">
        <span className="section-marker" aria-hidden="true">
          <IconSprout />
        </span>
        {children}
      </span>
    </h2>
  );
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
              <h1 style={{ wordBreak: "keep-all" }}>
                {page.name}
                <wbr />
                <span className="accent-text">の連作</span>
              </h1>
              <p className="ref-lead">{page.rotationLine}</p>

              {/* 事実は表ではなく定義リスト。狭い画面で崩れず、読み上げでも対になる。 */}
              <dl className="crop-facts">
                <Fact label="科" value={page.familyJa} />
                <Fact label="あける年数の目安">
                  <span className={`ref-years is-${page.tier}`}>
                    {page.yearsLabel}
                  </span>
                </Fact>
                <Fact label="種まき・植え付け">
                  <span className="crop-months">
                    <IconSeedling aria-hidden="true" />
                    {page.sowLabel}
                  </span>
                </Fact>
                <Fact label="収穫">
                  <span className="crop-months">
                    <IconClock aria-hidden="true" />
                    {page.harvestLabel}
                  </span>
                </Fact>
              </dl>

              {page.note ? <p className="crop-note">{page.note}</p> : null}
            </div>
          </section>

          <hr className="soil-divider no-print" aria-hidden="true" />

          <section className="crop-section" aria-labelledby="same-h">
            <div className="container container-narrow">
              <Heading id="same-h">
                {`${page.name}のあとに避ける野菜（同じ${page.familyJa}）`}
              </Heading>
              <p className="ref-lead">
                {page.tier === "none"
                  ? `${page.familyJa}は続けて植えやすいグループですが、土の養分は使われます。同じ${page.familyJa}にはこれらがあります。`
                  : `連作障害は野菜の名前ではなく科の単位で起きます。${page.name}を育てた区画では、名前が違ってもこれらの野菜が同じ${page.yearsLabel}のあいだ連作にあたります。`}
              </p>
              {page.sameFamily.length > 0 ? (
                <CropChips items={page.sameFamily} tone="same" />
              ) : (
                <p className="crop-empty">
                  この科でマスタに載っているのは{page.name}だけです。
                </p>
              )}
            </div>
          </section>

          <section className="crop-section" aria-labelledby="next-h">
            <div className="container container-narrow">
              <Heading id="next-h">{`${page.name}のあとに植えやすい野菜`}</Heading>
              <p className="ref-lead">
                {page.familyJa}
                以外の科で、それ自身も区画を長く縛らない野菜です。あいだにはさむ「休ませ役」として使えます。
              </p>
              <CropChips items={page.followUps} tone="next" />
            </div>
          </section>

          <section className="crop-section" aria-labelledby="comp-h">
            <div className="container container-narrow">
              <Heading id="comp-h">{`${page.name}と一緒に植えるなら`}</Heading>
              <div className="crop-companions">
                <div>
                  <h3 className="crop-sub is-good">相性がよいとされる</h3>
                  <CropChips items={page.companionGood} tone="good" />
                </div>
                {page.companionBad.length > 0 ? (
                  <div>
                    <h3 className="crop-sub is-bad">近くに植えないほうがよい</h3>
                    <CropChips items={page.companionBad} tone="bad" />
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
              <Heading id="faq-h">{`${page.name}の連作についてよくある質問`}</Heading>
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
