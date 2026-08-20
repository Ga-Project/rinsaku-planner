// 読み物セクション（早見表 + よくある質問）。
//
// サーバーコンポーネント（"use client" を付けない）である ことが重要:
// プランナー本体はクライアントの島なので静的書き出しの HTML に中身が出ない。
// この節はビルド時に HTML として焼き込まれ、プランナーを触る前の読み手にも、
// クローラにも、連作データがそのまま読める状態になる。
import { familyReference, rotationYearsLabel, FAQ } from "../lib/reference.mjs";

/** あける年数の重さを段階で表す（色だけに頼らず、ラベルも併記する）。 */
function severity(years: number): "heavy" | "mid" | "light" {
  if (years >= 4) return "heavy";
  if (years >= 2) return "mid";
  return "light";
}

export function ReferenceSection() {
  const families = familyReference();

  return (
    <section id="guide" className="reference no-print" aria-labelledby="guide-h">
      <div className="container">
        <div className="ref-head">
          <span className="eyebrow">ROTATION REFERENCE</span>
          <h2 id="guide-h">科（ファミリー）別 連作あけ年数 早見表</h2>
          <p className="ref-lead">
            連作障害は野菜の名前ではなく「科」の単位で考えます。同じ科をもう一度その場所に植えるまで、どのくらいあけるとよいかの目安です。地域・品種・土壌の状態によって前後します。
          </p>
        </div>

        <div className="ref-table-wrap">
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
                  <th scope="row">
                    <span
                      className="ref-dot"
                      style={{ ["--fam" as string]: f.hue }}
                      aria-hidden="true"
                    />
                    {f.nameJa}
                  </th>
                  <td>
                    <span className={`ref-years is-${severity(f.rotationYears)}`}>
                      {rotationYearsLabel(f.rotationYears)}
                    </span>
                  </td>
                  <td className="ref-crops">
                    {f.crops.join("・")}
                    {f.cropCount > f.crops.length ? " ほか" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="ref-note">
          年数を覚える必要はありません。
          <a href="#app">上のプランナー</a>
          に区画と作付けを記録しておくと、同じ科が近すぎる区画を色と印で知らせます。
        </p>

        <div className="ref-head ref-head-faq">
          <h2 id="faq-h">連作障害・輪作のよくある質問</h2>
        </div>

        <div className="ref-faq" aria-labelledby="faq-h">
          {FAQ.map((item: { q: string; a: string }) => (
            <details key={item.q} className="ref-faq-item">
              <summary>
                <span className="ref-faq-q">{item.q}</span>
              </summary>
              <p className="ref-faq-a">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
