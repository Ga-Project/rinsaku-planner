"use client";

import { useMemo } from "react";
import type { Planting, Suggestion } from "../lib/types";
import {
  suggestPlantings,
  groupSuggestions,
  nextMonth,
} from "../lib/suggest.mjs";
import { CROPS } from "../lib/crops.mjs";
import { MONTH_LABELS } from "../lib/schedule.mjs";
import { IconCheck, IconWarn, IconStop, IconDashed, IconSprout } from "./icons";

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
  showReason,
  onPick,
}: {
  title: string;
  note: string;
  cls: string;
  Icon: (props: { className?: string }) => JSX.Element;
  items: Suggestion[];
  /** チップに「いつ同じ科を植えたか」を可視テキストで添えるか。 */
  showReason: boolean;
  onPick: (cropId: string, targetYear: number) => void;
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
            // 判定理由は title 属性だとタッチ環境で表示されず、支援技術にも
            // 確実には届かない。一番重い情報なのでアクセシブル名に含める。
            aria-label={`${s.nameJa}（${s.familyJa}）を作付けに選ぶ。${s.reason}`}
            onClick={() => onPick(s.cropId, s.targetYear)}
          >
            <span className="plantnow-chip-name">{s.nameJa}</span>
            <span className="plantnow-chip-family">{s.familyJa}</span>
            {showReason && s.lastSameFamilyYear !== null && (
              <span className="plantnow-chip-note">
                {s.lastSameFamilyYear}年に同じ科
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 「いま、この区画に植えられる野菜」。
 *
 * 区画の作付け履歴（＝連作の縛り）と暦月（＝種まき適期）の両方を見て、
 * 今その区画に置ける作物を出す。苗や種を買う前の「ここに今なにを植えられるか」に
 * 答える部分で、記録ツールから判断ツールへ渡す橋になる。選ぶと下の作付けフォームに入る。
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
  onPick: (cropId: string, targetYear: number) => void;
}) {
  const { groups, total } = useMemo(() => {
    const list = suggestPlantings(plantings, CROPS, month, year);
    return { groups: groupSuggestions(list), total: list.length };
  }, [plantings, month, year]);

  const monthLabel = MONTH_LABELS[month - 1] ?? `${month}月`;
  const nextLabel = MONTH_LABELS[nextMonth(month) - 1] ?? "翌月";
  // 今月が適期のものが1件も無い月がある（作物マスタ上 12月・1月）。
  // その月に「◯月が適期で…」と書くと画面の中身と食い違うので、文を替える。
  const hasThisMonth =
    groups.now.length + groups.caution.length + groups.avoid.length > 0;

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
          {monthLabel}も{nextLabel}
          も、種まき・植え付けの適期を迎える作物はこの一覧にはありません。
        </p>
      ) : (
        <>
          <p className="muted plantnow-lead">
            {hasThisMonth
              ? `${monthLabel}が適期の野菜を、この区画の連作の記録に照らして並べています。選ぶと下の作付けフォームに入ります。`
              : `${monthLabel}が適期の野菜はありません。${nextLabel}から蒔けるものを出しています。`}
          </p>

          <Group
            title="この区画に植えられます"
            note={`${monthLabel}が適期`}
            cls="is-ok"
            Icon={IconCheck}
            items={groups.now}
            showReason={false}
            onPick={onPick}
          />
          <Group
            title="植えられますが間隔に注意"
            note="前回の同じ科から目安ちょうど"
            cls="is-caution"
            Icon={IconWarn}
            items={groups.caution}
            showReason
            onPick={onPick}
          />
          <Group
            title="いまが適期でも、この区画では避けたい"
            note="同じ科をあけたい年数の内側"
            cls="is-ng"
            Icon={IconStop}
            items={groups.avoid}
            showReason
            onPick={onPick}
          />
          <Group
            title={`${nextLabel}から蒔けます`}
            note="種や苗の準備に"
            cls="is-soon"
            Icon={IconDashed}
            items={groups.soon}
            showReason={false}
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
