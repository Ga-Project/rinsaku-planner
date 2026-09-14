"use client";

import type { Crop, FocusVerdict, RotationStatus } from "../lib/types";
import {
  verdictNote,
  verdictDetail,
  sameYearNote,
  laterNote,
} from "../lib/cropFocus.mjs";
import { summarizeMonths } from "../lib/schedule.mjs";
import { IconCheck, IconWarn, IconStop, IconSeedling, IconPlus } from "./icons";

/**
 * 野菜ページ（/yasai/<id>/）から「この野菜を植えたい」を持って来た人に、
 * どの区画に置けるかを先に見せる帯。
 *
 * これまで野菜ページの CTA はトップに合流するだけで、せっかく名前を持って来たのに
 * 着いた先でその野菜をもう一度探し直す必要があった。
 *
 * ■ 何を答えていて、何を答えていないか
 *   ここが見るのは連作（同じ科をあけたい年数）だけで、いまが種まきの適期かは見ない。
 *   両方を1つの判定に混ぜると、9月にトマトを「植えられます」と言い切ってしまい、
 *   すぐ下の「いま植えるなら」と同じ製品の中で矛盾する。
 *   判定はさらに「何年に植えるか」にも依存するので、年も断り書きではなく見出しに出す。
 *
 * ■ 区画セルの判定とは語彙を分ける
 *   区画セルの StateBadge は「その区画に最後に植えた作付け」の判定で、ここは
 *   「これからその野菜を植える場合」の判定。問いが違うので、StateBadge の語
 *   （連作NG / 間隔に注意 / 植え付けOK）はここでは一切使わず、必ず野菜の名前を
 *   主語にした文で言う。同じ区画が帯では ok・グリッドでは ng になることは普通に
 *   起きるので、どちらの問いへの答えかを文自身が名乗る必要がある。
 *
 * ■ 判定は上書きしない
 *   その年すでに同じ科を記録している場合も、判定（ok / caution / ng）は
 *   判定エンジンの値のまま出し、記録があることは別行の注記で添える。
 *   判定を差し替えると、別の作物の記録をこの野菜の記録として言ってしまう。
 */

/**
 * 判定ごとの見え方。語は必ず野菜名を主語にした文になるよう組み立てる。
 * 区画セル（status-ui.tsx）の語をここへ持ち込まない（問いが違う）。
 */
const META: Record<
  RotationStatus,
  { cls: string; Icon: (p: { className?: string }) => JSX.Element; phrase: string }
> = {
  ok: { cls: "is-ok", Icon: IconCheck, phrase: "を植えられます" },
  caution: { cls: "is-caution", Icon: IconWarn, phrase: "を植えられます。もう1年あくと安心です" },
  ng: { cls: "is-ng", Icon: IconStop, phrase: "はこの区画では避けたい" },
};

export function CropFocus({
  crop,
  verdicts,
  headline,
  targetYear,
  selectedBedId,
  onSelectBed,
  onAddBed,
  onClear,
}: {
  crop: Crop;
  verdicts: FocusVerdict[];
  headline: string;
  targetYear: number;
  selectedBedId: string | null;
  onSelectBed: (bedId: string) => void;
  onAddBed: () => void;
  onClear: () => void;
}) {
  const sow = summarizeMonths(crop.sowMonths);

  return (
    <section className="crop-focus no-print" aria-labelledby="crop-focus-heading">
      <div className="crop-focus-head">
        <div className="grow">
          <p className="crop-focus-eyebrow">野菜別 連作ガイドから</p>
          <h2 id="crop-focus-heading" className="crop-focus-title">
            {crop.nameJa}を植えられる区画
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary crop-focus-clear"
          aria-label={`${crop.nameJa}の絞り込みを解除する`}
          onClick={onClear}
        >
          解除
        </button>
      </div>

      {/* 判定が何に依存しているかを、脚注ではなく見出しの直下に置く。
          連作だけを見ていること・どの年に植える前提かの2つ。 */}
      <p className="crop-focus-scope">
        {targetYear}年に植える場合の<strong>連作（同じ科をあけたい年数）だけ</strong>
        を見ています。種まきの適期は含みません。
      </p>

      <p className="crop-focus-facts">
        <span>{crop.familyJa}</span>
        <span aria-hidden="true">・</span>
        <span>
          {crop.rotationYears > 0
            ? `同じ科をあけたい年数 ${crop.rotationYears}年`
            : "続けて植えやすい野菜"}
        </span>
        {sow ? (
          <>
            <span aria-hidden="true">・</span>
            <span className="crop-focus-sow">
              <IconSeedling aria-hidden="true" />
              種まき・植え付け {sow}
            </span>
          </>
        ) : null}
      </p>

      <p className="crop-focus-headline">{headline}</p>
      {verdicts.length > 0 ? (
        <p className="crop-focus-hint">
          区画を選ぶと、{crop.nameJa}が選ばれた状態でその区画の編集に移ります。
        </p>
      ) : null}

      {verdicts.length === 0 ? (
        <div className="crop-focus-empty">
          <button type="button" className="btn btn-primary" onClick={onAddBed}>
            <IconPlus />
            区画を置いて{crop.nameJa}を検討する
          </button>
        </div>
      ) : (
        <ul className="crop-focus-list">
          {verdicts.map((v) => {
            const m = META[v.status];
            const Icon = m.Icon;
            const note = verdictNote(v);
            const label = v.label || "区画";
            const sameYear = sameYearNote(v, targetYear);
            const later = laterNote(v);
            return (
              <li key={v.bedId}>
                <button
                  type="button"
                  className={`crop-focus-bed ${m.cls}`}
                  // 単一選択であってトグルではないので aria-current（区画セルと同じ流儀）。
                  aria-current={v.bedId === selectedBedId ? "true" : undefined}
                  // 名前を制御する（同製品の候補チップと同じ流儀）。与えないと
                  // 読み上げの名前がチップ内の全テキストの連結になり、区画名・判定・
                  // 根拠・注記が切れ目なく1つの長い段落として読まれる。
                  // 目に見せていない根拠（判定エンジンの reason）はここに載せる。
                  aria-label={[
                    `${label} — ${crop.nameJa}${m.phrase}`,
                    v.reason,
                    sameYear,
                    later,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelectBed(v.bedId)}
                >
                  <span className="crop-focus-bed-head">
                    <Icon />
                    <span className="crop-focus-bed-label">{label}</span>
                    {note ? (
                      <span className="crop-focus-bed-note">{note}</span>
                    ) : null}
                  </span>
                  {/* 判定の言葉。あき年数は上のバッジが持つので、ここでは繰り返さない。 */}
                  <span className="crop-focus-bed-verdict">
                    {crop.nameJa}
                    {m.phrase}
                  </span>
                  {/* 根拠は「いつ・どれだけ・目安いくつ」の事実だけに畳む。 */}
                  <span className="crop-focus-bed-reason">
                    {verdictDetail(v)}
                  </span>
                  {/* 以下は判定に影響しない注記。判定文とは別の行に置く。 */}
                  {sameYear ? (
                    <span className="crop-focus-bed-record">{sameYear}</span>
                  ) : null}
                  {later ? (
                    <span className="crop-focus-bed-record">{later}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
