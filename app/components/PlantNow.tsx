"use client";

import { useId, useState } from "react";
import type { PanelChip, PanelGroups } from "../lib/types";
import { nextMonth } from "../lib/suggest.mjs";
import { MONTH_LABELS } from "../lib/schedule.mjs";
import { Verdict } from "./status-ui";
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
  items: PanelChip[];
  selectedCropId: string;
  onPick: (s: PanelChip) => void;
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
              // 科名は表示・読み上げともフル表記。括弧が付く科は
              // 「ヒガンバナ科（ネギ類）」の1つだけで、利用者が認識するのは
              // 括弧の中身のほう。狭い幅では折り返すが、チップは列が伸びるので
              // 破綻しないことを実測で確認している。
              aria-label={`${s.nameJa}（${s.familyJa}）— ${state}。${s.text}`}
              onClick={() => onPick(s)}
            >
              <span className="plantnow-chip-name">{s.nameJa}</span>
              <span className="plantnow-chip-family">{s.familyJa}</span>
              {/* 補助ラベルの出し分けは verdictCopy が持つ。年数ではなく年を出すのは
                  「あと5年」の起点が画面に無く検算できないため。衝突相手が判定年より
                  後のときに「早くて◯年」を出さないのは、その年が未来の計画より後ろに
                  なり、候補同士を「どれが先に空くか」で見比べる用途に対して嘘になるため。 */}
              {s.note !== null && (
                <span className="plantnow-chip-note">{s.note}</span>
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
  groups,
  total,
  month,
  year,
  selectedCropId,
  undecidableNotice,
  onPick,
}: {
  /** 判定ずみの候補（文・補助ラベルは組み立て済み）。ここでは作らない。 */
  groups: PanelGroups;
  total: number;
  /** 判定に入れていない記録があることの但し書き（無ければ null）。 */
  undecidableNotice: string | null;
  month: number;
  year: number;
  selectedCropId: string;
  onPick: (s: PanelChip) => void;
}) {

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
          {/* 判定がどの年を前提にしているかを置く。すぐ上の区画のバナーが
              「すでに記録した作付けの判定 ── 2027年 トマト」と名乗るのと対にする。
              判定の説明文が年を名指しするようになったので、その基準点が要る。
              判定する対象が無い月には出さない。 */}
          <p className="muted plantnow-scope">
            これから植える場合の判定 ── {year}年{monthLabel}
          </p>
          {/* 下の判定が数えていない記録があることを、群見出しより先に言う。
              これが無いと「この区画に植えられます」が、科の分からない記録を
              勘定に入れたうえでの断定に読める。 */}
          {undecidableNotice !== null && (
            <Verdict status="unknown" text={undecidableNotice} />
          )}
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
            note="この区画の同じ科の作付けとの間隔が、目安ちょうどです"
            state="植えられますが間隔に注意"
            cls="is-caution"
            Icon={IconWarn}
            items={groups.caution}
            selectedCropId={selectedCropId}
            onPick={onPick}
          />
          <Group
            title="いまが適期でも、この区画では避けたい"
            note="この区画の同じ科の作付けとの間隔が、目安に足りません"
            state="この区画では避けたい"
            cls="is-ng"
            Icon={IconStop}
            items={groups.avoid}
            selectedCropId={selectedCropId}
            onPick={onPick}
          />
          <Group
            title={
              month === 12
                ? `${year + 1}年${nextLabel}からの作付けに`
                : `${nextLabel}からの作付けに`
            }
            note="種や苗の準備に"
            state={
              month === 12
                ? `${year + 1}年${nextLabel}から植えられます`
                : `${nextLabel}から植えられます`
            }
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
