// 読み物セクション（早見表 + よくある質問）。
//
// サーバーコンポーネント（"use client" を付けない）であることが重要:
// プランナー本体はクライアントの島なので静的書き出しの HTML に中身が出ない。
// この節はビルド時に HTML として焼き込まれ、プランナーを触る前の読み手にも、
// クローラにも、連作データがそのまま読める状態になる。
import {
  familyReference,
  rotationYearsLabel,
  FAQ,
} from "../lib/reference.mjs";
import { IconSprout } from "./icons";

/** 見出しのスプラウト印。この製品の全セクション見出しと同じ語彙に揃える。 */
function SectionHeading({ id, children }: { id: string; children: string }) {
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

export function ReferenceSection() {
  const families = familyReference();

  return (
    <>
      <hr className="soil-divider no-print" aria-hidden="true" />

      <section
        id="guide"
        className="reference no-print"
        aria-labelledby="guide-h"
      >
        <div className="container container-narrow">
          <div className="ref-head">
            <span className="eyebrow">ROTATION REFERENCE</span>
            <SectionHeading id="guide-h">
              科（ファミリー）別 連作あけ年数 早見表
            </SectionHeading>
            <p className="ref-lead">
              連作障害は野菜の名前ではなく「科」の単位で考えます。同じ科をもう一度その場所に植えるまで、どのくらいあけるとよいかの目安です。地域・品種・土壌の状態によって前後します。
            </p>
          </div>

          {/* 640px 以下では表を積んでカードにする（ui.css）。それより広く本文幅に
              収まらない中間幅では、この箱の中だけで横スクロールする。スクロールする
              コンテナはキーボードでも送れる必要があるため focusable にしている。 */}
          <div
            className="ref-table-wrap"
            tabIndex={0}
            role="group"
            aria-label="科別 連作あけ年数の一覧"
          >
            <table className="ref-table">
              <caption className="visually-hidden">
                科ごとの、同じ場所に再び植えるまであける目安年数と、その科の主な野菜
              </caption>
              <thead>
                <tr>
                  <th scope="col">科</th>
                  <th scope="col">あける年数の目安</th>
                  <th scope="col">この科の主な野菜</th>
                </tr>
              </thead>
              <tbody>
                {families.map((f) => (
                  <tr key={f.key}>
                    <th scope="row" data-label="科">
                      {/* 狭い画面では th が grid になるため、印と科名は1つの要素に
                          まとめて「1セル分」として扱われるようにする。 */}
                      <span className="ref-fam">
                        <span
                          className="ref-dot"
                          style={{ ["--fam" as string]: f.hue }}
                          aria-hidden="true"
                        />
                        {f.nameJa}
                      </span>
                    </th>
                    <td data-label="あける年数の目安">
                      <span className={`ref-years is-${f.tier}`}>
                        {rotationYearsLabel(f.rotationYears)}
                      </span>
                    </td>
                    <td className="ref-crops" data-label="この科の主な野菜">
                      {f.crops.join("・")}
                      {f.cropCount > f.crops.length ? " ほか" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="ref-note">
            年数を覚える必要はありません。畑めぐりに区画と作付けを記録しておくと、同じ科が近すぎる区画を色と印で知らせます。
          </p>
        </div>
      </section>

      <section id="faq" className="reference-faq no-print" aria-labelledby="faq-h">
        <div className="container container-narrow">
          <SectionHeading id="faq-h">連作障害・輪作のよくある質問</SectionHeading>

          <div className="ref-faq">
            {FAQ.map((item: { q: string; a: string }, i: number) => (
              // 先頭だけ開いておく。折りたたみの中身が存在することが一目で分かる。
              <details key={item.q} className="ref-faq-item" open={i === 0}>
                <summary>
                  <span className="ref-faq-q">{item.q}</span>
                </summary>
                <p className="ref-faq-a">{item.a}</p>
              </details>
            ))}
          </div>

          <p className="ref-cta">
            <a className="btn btn-primary btn-lg" href="#app">
              この年数で計画をつくる
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
