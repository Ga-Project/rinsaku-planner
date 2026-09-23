"use client";

import { useMemo, useRef, useState } from "react";
import type { Bed, BedKind, PanelChip } from "../lib/types";
import { CROPS, cropById, cropsGroupedByFamily } from "../lib/crops.mjs";
import { summarizeMonths } from "../lib/schedule.mjs";
import { panelVerdicts } from "../lib/verdictCopy.mjs";
import { normalizeYear } from "../lib/storage.mjs";
import { Verdict, StateBadge } from "./status-ui";
import { PlantNow } from "./PlantNow";
import { IconPlus, IconTrash } from "./icons";

const GROUPS = cropsGroupedByFamily();

export function BedEditor({
  bed,
  currentYear,
  currentMonth,
  onUpdateBed,
  onAddPlanting,
  onRemovePlanting,
  onDeleteBed,
  initialCropId = "",
  initialYear,
}: {
  bed: Bed;
  currentYear: number;
  currentMonth: number;
  onUpdateBed: (patch: Partial<Pick<Bed, "label" | "kind">>) => void;
  onAddPlanting: (cropId: string, year: number) => void;
  onRemovePlanting: (plantingId: string) => void;
  onDeleteBed: () => void;
  /**
   * 追加フォームの初期値。既定は「未選択・今年」で、通常の利用では渡さない。
   * プレビュー面は作物を選ぶまで描かれないため、これが無いと**描画を伴う検査で
   * プレビューに一度も到達できない**（＝プレビューの配線が固定できない）。
   */
  initialCropId?: string;
  initialYear?: number | "";
}) {
  const [cropId, setCropId] = useState(initialCropId);
  // 空文字を許容して、年をバックスペースで消して入力し直せるようにする。
  // 追加・プレビュー時のみ currentYear を既定値として適用する。
  const [year, setYear] = useState<number | "">(initialYear ?? currentYear);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 候補を押したときに何が起きたかを読み上げ・目視の双方に伝える（選択は画面下のフォームで起きる）。
  const [pickNotice, setPickNotice] = useState("");
  const cropSelectRef = useRef<HTMLSelectElement>(null);

  // 画面に出る文はすべて panelVerdicts が作る。判定年をどこから採るかは
  // その関数の内側に閉じてあるので、ここで取り違えることができない。
  const panel = useMemo(
    () =>
      panelVerdicts({
        plantings: bed.plantings,
        month: currentMonth,
        currentYear,
        formCropId: cropId,
        formYear: year,
        cropLookup: cropById,
        crops: CROPS,
      }),
    [bed.plantings, currentMonth, currentYear, cropId, year],
  );

  function handleAdd() {
    if (!cropId) return;
    // 入力欄は 2026.5 や 20226 をそのまま受け取れる（min/max は入力を止めない）。
    // 生値のまま保存すると、リロード時の丸めで利用者が何もしていないのに
    // 判定が反転する。記録する値をここで確定し、欄にも書き戻して一致させる。
    const normalized = normalizeYear(year, currentYear);
    setYear(normalized);
    onAddPlanting(cropId, normalized);
    setCropId("");
  }

  return (
    <div className="bed-editor card">
      <div className="section-head">
        <h3 style={{ marginTop: 0 }}>区画の編集</h3>
        <StateBadge status={panel.badgeStatus} />
      </div>

      <div className="field">
        <label htmlFor="bed-label">区画の名前</label>
        <input
          id="bed-label"
          type="text"
          value={bed.label}
          maxLength={40}
          placeholder="例: 畝1 / ベランダ左"
          onChange={(e) => onUpdateBed({ label: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="bed-kind">種類</label>
        <select
          id="bed-kind"
          value={bed.kind}
          onChange={(e) => onUpdateBed({ kind: e.target.value as BedKind })}
        >
          <option value="row">畝（地植え）</option>
          <option value="planter">プランター</option>
        </select>
      </div>

      {/* 作物マスタに無い id（古い保存データ等）。判定欄が黙って消えると
          「なぜ何も出ないのか」が利用者に分からないので、理由だけ出す。 */}
      {panel.unknownCropText !== null && (
        <Verdict status="unknown" text={panel.unknownCropText} />
      )}

      {panel.banner !== null && (
        <>
          {/* このバナーは「すでに記録した作付け」を、それ以前の記録に照らして判定したもの。
              すぐ下の候補は「これから植える場合」の判定で時制が違うため、
              どちらの話かを必ず言葉で分ける（同じランプ色が隣り合うので取り違えられる）。 */}
          <p className="muted verdict-scope">
            すでに記録した作付けの判定 ── {panel.banner.latestYear}年{" "}
            {cropById(panel.banner.latestCropId)?.nameJa ??
              panel.banner.latestCropId}
          </p>
          <Verdict status={panel.banner.status} text={panel.banner.text} />
        </>
      )}

      {/* この区画の記録と今月の適期から、これから植えられる作物を先に見せる。
          選ぶと下の追加フォームに入り、そのまま記録できる。 */}
      <PlantNow
        groups={panel.groups}
        total={panel.totalChips}
        undecidableNotice={panel.undecidableNotice}
        month={currentMonth}
        year={currentYear}
        selectedCropId={cropId}
        onPick={(s: PanelChip) => {
          setCropId(s.cropId);
          // 候補はその年に植える前提で連作を判定しているので、年も候補側に合わせる
          // （12月に「1月からの作付け」を選ぶと翌年になる）。入力中の年は上書きされる。
          setYear(s.targetYear);
          // チップ本体と同じ文を読み上げる（同じデータなので食い違わない）。
          setPickNotice(`${s.nameJa}を選びました。${s.text}`);
          // 選んだ結果が入るフォームまで視線を運ぶ（下にあって見えないことがある）。
          cropSelectRef.current?.focus();
        }}
      />
      <p className="visually-hidden" role="status" aria-live="polite">
        {pickNotice}
      </p>

      <h4 style={{ marginTop: "var(--sp-6)", marginBottom: 0 }}>
        作付けの記録
      </h4>
      {bed.plantings.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--sp-2)" }}>
          まだ記録がありません。育てた・育てる作物を年とともに追加すると、同じ科の連作を判定します。
        </p>
      ) : (
        <ul className="planting-list">
          {[...bed.plantings]
            .sort((a, b) => b.year - a.year)
            .map((p) => {
              const c = cropById(p.cropId);
              return (
                <li key={p.id} className="planting-item">
                  <span className="grow">
                    <strong>{p.year}年</strong>　{c ? c.nameJa : p.cropId}
                    {c ? <span className="muted">（{c.familyJa}）</span> : null}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={`${p.year}年の${c ? c.nameJa : "作付け"}を削除`}
                    onClick={() => onRemovePlanting(p.id)}
                  >
                    <IconTrash />
                  </button>
                </li>
              );
            })}
        </ul>
      )}

      <div className="row-2" style={{ marginTop: "var(--sp-4)" }}>
        <div className="field">
          <label htmlFor="add-crop">作物</label>
          <select
            id="add-crop"
            ref={cropSelectRef}
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
          >
            <option value="">作物を選ぶ…</option>
            {GROUPS.map((g) => (
              <optgroup key={g.family.key} label={g.family.nameJa}>
                {g.crops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameJa}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-year">年</label>
          <input
            id="add-year"
            type="number"
            inputMode="numeric"
            value={year}
            min={1900}
            max={3000}
            onChange={(e) =>
              setYear(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
      </div>

      {panel.preview !== null && (
        <div style={{ marginTop: "var(--sp-3)" }}>
          {/* 但し書きはチップ群の上にもあるが、プレビューはその下にあるので
              ここにも届ける（下だけを見ている人に伝わらない）。ただし枠つきの
              Verdict を重ねると同じ事実が1パネルに3回並ぶので、科・適期を出す
              この muted 行に短句として合流させる。 */}
          <p className="muted" style={{ marginBottom: "var(--sp-1)" }}>
            {panel.preview.crop.familyJa}・種まき/植え付け{" "}
            {summarizeMonths(panel.preview.crop.sowMonths)}／収穫{" "}
            {summarizeMonths(panel.preview.crop.harvestMonths)}
            {panel.undecidablePreviewNote !== null && (
              <>
                {" "}
                {panel.undecidablePreviewNote}
              </>
            )}
          </p>

          {/* 年入力は1打鍵ごとに再計算されるので、読み上げは通知しない
              （途中の値で長文が繰り返し読まれる）。選択結果は下の pickNotice が伝える。 */}
          <Verdict
            status={panel.preview.status}
            text={panel.preview.text}
            live={false}
          />
        </div>
      )}

      <div className="toolbar" style={{ marginTop: "var(--sp-4)" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!cropId}
          onClick={handleAdd}
        >
          <IconPlus />
          作付けを追加
        </button>
      </div>

      <hr />

      {confirmDelete ? (
        <div className="alert" role="alertdialog" aria-label="区画の削除確認">
          <span className="grow">
            この区画を削除しますか？ 登録した作物と記録も消えます。
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmDelete(false)}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onDeleteBed}
          >
            削除する
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setConfirmDelete(true)}
        >
          <IconTrash />
          この区画を削除
        </button>
      )}
    </div>
  );
}
