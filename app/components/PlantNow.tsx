"use client";

import { useId, useMemo, useState } from "react";
import type { Planting, Suggestion } from "../lib/types";
import {
  suggestPlantings,
  groupSuggestions,
  nextMonth,
} from "../lib/suggest.mjs";
import { CROPS } from "../lib/crops.mjs";
import { MONTH_LABELS } from "../lib/schedule.mjs";
import { IconCheck, IconWarn, IconStop, IconClock } from "./icons";

/** 作付け最盛期は候補が48件出る月がある。既定で見せる件数を抑え、残りは開いて見せる。 */
const VISIBLE_LIMIT = 8;

/**
 * 候補のひとまとまり。見出しの語・アイコン形状・色の三重で状態を示し、
 * 支援技術に対しては見出しとの関連付け（role=group）と
 * チップのアクセシブル名（状態語＋理由）で同じ情報を届ける。
 */
function Group({
  title,
  note,
  state,
  cls,
  Icon,
  items,
  selectedCropId,
  onPick,
}: {
  title: string;
  note: string;
  /** アクセシブル名の先頭に置く状態語。読み上げでチップ同士が同一に聞こえないようにする。 */
  state: string;
  cls: string;
  Icon: (props: { className?: string }) => JSX.Element;
  items: Suggestion[];
  selectedCropId: string;
  onPick: (s: Suggestion) => void;
}) {
  const headId = useId();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, VISIBLE_LIMIT);
  const hidden = items.length - shown.length;

  return (
    <div className={`plantnow-group ${cls}`} role="group" aria-labelledby={headId}>
      <p className="plantnow-group-head" id={headId}>
        <Icon />
        <span className="plantnow-group-title">{title}</span>
        <span className="muted plantnow-group-note">{note}</span>
      </p>
      <ul className="plantnow-chips">
        {shown.map((s) => (
          <li key={s.cropId}>
            <button
              type="button"
              className="plantnow-chip"
              aria-pressed={s.cropId === selectedCropId}
              // 見た目（色・形）で伝えている状態を、読み上げにも同じだけ乗せる。
              // 理由は title 属性だとタッチでもキーボードでも開けないので名前に含める。
              aria-label={`${s.nameJa}（${s.familyJa}）— ${state}。${s.reason}`}
              onClick={() => onPick(s)}
            >
              <span className="plantnow-chip-name">{s.nameJa}</span>
              <span className="plantnow-chip-family">{s.familyJa}</span>
              {s.remainingYears !== null && (
                <span className="plantnow-chip-note">
                  あと{s.remainingYears}年
                </span>
              )}
              {s.remainingYears === null && s.status === "caution" && (
                <span className="plantnow-chip-note">目安ちょうど</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="btn btn-ghost plantnow-more"
          onClick={() => setExpanded(true)}
        >
          ほか{hidden}件を見る
        </button>
      )}
    </div>
  );
}

/**
 * 「いま、この区画に植えられる野菜」。
 *
 * 区画の作付けの記録（＝連作の縛り）と暦月（＝適期）の両方を見て、
 * これからその区画に置ける作物を出す。苗や種を買う前の
 * 「ここに今なにを植えられるか」に答える部分で、記録ツールから判断ツールへ渡す橋。
 * すぐ上の区画の判定バナーが「すでに記録した作付け」を見ているのに対し、
 * ここは「これから植える場合」を見る（時制が違うので文言で必ず区別する）。
 */
export function PlantNow({
  plantings,
  month,
  year,
  selectedCropId,
  onPick,
}: {
  plantings: Planting[];
  month: number;
  year: number;
  selectedCropId: string;
  onPick: (s: Suggestion) => void;
}) {
  const { groups, total } = useMemo(() => {
    const list = suggestPlantings(plantings, CROPS, month, year);
    return { groups: groupSuggestions(list), total: list.length };
  }, [plantings, month, year]);

  const monthLabel = MONTH_LABELS[month - 1] ?? `${month}月`;
  const nextLabel = MONTH_LABELS[nextMonth(month) - 1] ?? "翌月";
  // 今月が適期の作物が1件も無い月がある（作物マスタ上は12月・1月）。
  // その月に「◯月が適期で…」と書くと画面の中身と食い違うので文を替える。
  const hasThisMonth =
    groups.now.length + groups.caution.length + groups.avoid.length > 0;

  return (
    <section className="plantnow no-print" aria-labelledby="plantnow-heading">
      <h4 id="plantnow-heading" className="plantnow-title">
        いま植えるなら（{monthLabel}）
      </h4>

      {total === 0 ? (
        <p className="muted">
          {monthLabel}も{nextLabel}
          も、種まき・植え付けの適期を迎える作物はありません。
        </p>
      ) : (
        <>
          <p className="muted plantnow-lead">
            {hasThisMonth
              ? `${monthLabel}が適期の野菜を、これから植えるものとして、この区画の作付けの記録に照らして並べています。選ぶと下の作付けフォームに入ります。`
              : `${monthLabel}が適期の野菜はありません。${nextLabel}から植えられるものを出しています。`}
          </p>

          <Group
            title="この区画に植えられます"
            note={`${monthLabel}が適期`}
            state="この区画に植えられます"
            cls="is-ok"
            Icon={IconCheck}
            items={groups.now}
            selectedCropId={selectedCropId}
            onPick={onPick}
          />
          <Group
            title="植えられますが間隔に注意"
            // 群の説明で原因を断定しない。この区画に入っている同じ科の作付けは
            // 過去のものとは限らず、先の年の作付けを先に記録してあることもある
            // （そちらとの間隔で ng / caution になる）。「前に植えてから」と書くと、
            // 一度も植えていない区画の候補に対して事実と違う説明が付く。
            note="この区画の同じ科の作付けと、あけたい年数にちょうど届いたところ"
            state="植えられますが間隔に注意"
            cls="is-caution"
            Icon={IconWarn}
            items={groups.caution}
            selectedCropId={selectedCropId}
            onPick={onPick}
          />
          <Group
            title="いまが適期でも、この区画では避けたい"
            note="この区画の同じ科の作付けとの間隔が、まだ足りません"
            state="この区画では避けたい"
            cls="is-ng"
            Icon={IconStop}
            items={groups.avoid}
            selectedCropId={selectedCropId}
            onPick={onPick}
          />
          <Group
            title={`${nextLabel}からの作付けに`}
            note="種や苗の準備に"
            state={`${nextLabel}から植えられます`}
            cls="is-soon"
            Icon={IconClock}
            items={groups.soon}
            selectedCropId={selectedCropId}
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
