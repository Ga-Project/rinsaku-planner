"use client";

import { useMemo } from "react";
import type { Planting } from "../lib/types";
import { suggestPlantings, groupSuggestions } from "../lib/suggest.mjs";
import { CROPS } from "../lib/crops.mjs";
import { MONTH_LABELS } from "../lib/schedule.mjs";
import { IconCheck, IconWarn, IconStop, IconSprout } from "./icons";

interface Suggestion {
  cropId: string;
  nameJa: string;
  familyJa: string;
  familyKey: string;
  timing: "now" | "soon";
  status: "ok" | "caution" | "ng";
  reason: string;
}

/**
 * 候補のひとまとまり。見出しにテキストとアイコンの両方を出し、
 * 色だけに意味を持たせない（区画グリッドと同じ方針）。
 */
function Group({
  title,
  note,
  cls,
  Icon,
  items,
  onPick,
}: {
  title: string;
  note: string;
  cls: string;
  Icon: (props: { className?: string }) => JSX.Element;
  items: Suggestion[];
  onPick: (cropId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`plantnow-group ${cls}`}>
      <p className="plantnow-group-head">
        <Icon />
        <span>{title}</span>
        <span className="muted">{note}</span>
      </p>
      <div className="plantnow-chips">
        {items.map((s) => (
          <button
            type="button"
            key={s.cropId}
            className="plantnow-chip"
            // 科は名前だけでは分からないので、支援技術には科も読ませる。
            aria-label={`${s.nameJa}（${s.familyJa}）を作付けに選ぶ`}
            title={s.reason}
            onClick={() => onPick(s.cropId)}
          >
            <span className="plantnow-chip-name">{s.nameJa}</span>
            <span className="plantnow-chip-family">{s.familyJa}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 「いま、この区画に植えられる野菜」。
 *
 * 区画の作付け履歴（＝連作の縛り）と暦月（＝種まき適期）の両方を満たす作物だけを出す。
 * 苗や種を買う前の「ここに今なにを植えられるか」に答える部分で、
 * 記録ツールから判断ツールへ渡す橋になる。選ぶと下の作付けフォームに入る。
 */
export function PlantNow({
  plantings,
  month,
  year,
  onPick,
}: {
  plantings: Planting[];
  month: number;
  year: number;
  onPick: (cropId: string) => void;
}) {
  const groups = useMemo(
    () => groupSuggestions(suggestPlantings(plantings, CROPS, month, year)),
    [plantings, month, year],
  );

  const monthLabel = MONTH_LABELS[month - 1] ?? `${month}月`;
  const nextLabel = MONTH_LABELS[month === 12 ? 0 : month] ?? "翌月";
  const total =
    groups.now.length +
    groups.caution.length +
    groups.avoid.length +
    groups.soon.length;

  return (
    <section className="plantnow no-print" aria-labelledby="plantnow-heading">
      <h4 id="plantnow-heading" className="plantnow-title">
        <span className="section-marker" aria-hidden="true">
          <IconSprout />
        </span>
        いま植えるなら（{monthLabel}）
      </h4>

      {total === 0 ? (
        <p className="muted">
          {monthLabel}
          に種まき・植え付けの適期を迎える作物は、この一覧にはありません。
        </p>
      ) : (
        <>
          <p className="muted plantnow-lead">
            {monthLabel}が適期で、この区画の連作の記録とぶつからない野菜です。選ぶと下の作付けフォームに入ります。
          </p>

          <Group
            title="この区画に植えられます"
            note={`${monthLabel}が適期`}
            cls="is-ok"
            Icon={IconCheck}
            items={groups.now}
            onPick={onPick}
          />
          <Group
            title="植えられますが間隔に注意"
            note="前回の同じ科から目安ちょうど"
            cls="is-caution"
            Icon={IconWarn}
            items={groups.caution}
            onPick={onPick}
          />
          <Group
            title="いまが適期でも、この区画では避けたい"
            note="同じ科をあけたい年数の内側"
            cls="is-ng"
            Icon={IconStop}
            items={groups.avoid}
            onPick={onPick}
          />
          <Group
            title={`${nextLabel}から蒔けます`}
            note="種や苗の準備に"
            cls="is-soon"
            Icon={IconSprout}
            items={groups.soon}
            onPick={onPick}
          />
        </>
      )}

      <p className="muted plantnow-foot">
        時期は本州・中間地のおおよその目安です。地域や品種によって前後します。
      </p>
    </section>
  );
}
