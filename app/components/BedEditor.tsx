"use client";

import { useMemo, useRef, useState } from "react";
import type { Bed, BedKind, Suggestion } from "../lib/types";
import { bedStatus, evaluateRotation } from "../lib/rotation.mjs";
import { cropById, cropsGroupedByFamily } from "../lib/crops.mjs";
import { summarizeMonths } from "../lib/schedule.mjs";
import {
  bedVerdictText,
  previewVerdictText,
  suggestionText,
  UNKNOWN_CROP_TEXT,
} from "../lib/verdictCopy.mjs";
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
}: {
  bed: Bed;
  currentYear: number;
  currentMonth: number;
  onUpdateBed: (patch: Partial<Pick<Bed, "label" | "kind">>) => void;
  onAddPlanting: (cropId: string, year: number) => void;
  onRemovePlanting: (plantingId: string) => void;
  onDeleteBed: () => void;
}) {
  const [cropId, setCropId] = useState("");
  // 空文字を許容して、年をバックスペースで消して入力し直せるようにする。
  // 追加・プレビュー時のみ currentYear を既定値として適用する。
  const [year, setYear] = useState<number | "">(currentYear);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 候補を押したときに何が起きたかを読み上げ・目視の双方に伝える（選択は画面下のフォームで起きる）。
  const [pickNotice, setPickNotice] = useState("");
  const cropSelectRef = useRef<HTMLSelectElement>(null);

  const status = bedStatus(bed.plantings, cropById);

  // 追加フォームで選択中の作物・年に対する連作プレビュー（既存の作付けに照らす）。
  const preview = useMemo(() => {
    const crop = cropId ? cropById(cropId) : undefined;
    if (!crop) return null;
    const eff = year === "" ? currentYear : year;
    const past = bed.plantings
      .map((p) => {
        const c = cropById(p.cropId);
        return c ? { familyKey: c.familyKey, year: p.year } : null;
      })
      .filter((x): x is { familyKey: string; year: number } => x !== null);
    const result = evaluateRotation(
      past,
      crop.familyKey,
      crop.rotationYears,
      eff,
    );
    return {
      crop,
      result,
      // 判定年（eff）は入力欄の年なので過去も未来も来る。
      text: previewVerdictText(result, crop, eff, currentYear),
    };
  }, [cropId, year, bed.plantings, currentYear]);

  // 文の組み立て（どの作物名・どの年を渡すか）は lib 側に置いてある。
  // ここで組み立てると、引数の取り違えを JSX を描画しないと検査できなくなる。
  const bannerText = bedVerdictText(status, cropById, currentYear);

  function handleAdd() {
    if (!cropId) return;
    onAddPlanting(cropId, year === "" ? currentYear : year);
    setCropId("");
  }

  return (
    <div className="bed-editor card">
      <div className="section-head">
        <h3 style={{ marginTop: 0 }}>区画の編集</h3>
        <StateBadge status={status.status} />
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
      {status.unknownCrop && (
        <p className="muted" role="status">
          {UNKNOWN_CROP_TEXT}
        </p>
      )}

      {status.status !== "empty" && (
        <>
          {/* このバナーは「すでに記録した作付け」を、それ以前の記録に照らして判定したもの。
              すぐ下の候補は「これから植える場合」の判定で時制が違うため、
              どちらの話かを必ず言葉で分ける（同じランプ色が隣り合うので取り違えられる）。 */}
          {status.latestCropId !== null && status.latestYear !== null && (
            <p className="muted verdict-scope">
              すでに記録した作付けの判定 ── {status.latestYear}年{" "}
              {cropById(status.latestCropId)?.nameJa ?? status.latestCropId}
            </p>
          )}
          <Verdict status={status.status} text={bannerText ?? ""} />
        </>
      )}

      {/* この区画の記録と今月の適期から、これから植えられる作物を先に見せる。
          選ぶと下の追加フォームに入り、そのまま記録できる。 */}
      <PlantNow
        plantings={bed.plantings}
        month={currentMonth}
        year={currentYear}
        selectedCropId={cropId}
        onPick={(s: Suggestion) => {
          setCropId(s.cropId);
          // 候補はその年に植える前提で連作を判定しているので、年も候補側に合わせる
          // （12月に「1月からの作付け」を選ぶと翌年になる）。入力中の年は上書きされる。
          setYear(s.targetYear);
          // チップ本体と同じ文を読み上げる（片方だけ直すと食い違う）。
          setPickNotice(
            `${s.nameJa}を選びました。` + suggestionText(s, currentYear),
          );
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

      {preview && (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <p className="muted" style={{ marginBottom: "var(--sp-1)" }}>
            {preview.crop.familyJa}・種まき/植え付け{" "}
            {summarizeMonths(preview.crop.sowMonths)}／収穫{" "}
            {summarizeMonths(preview.crop.harvestMonths)}
          </p>
          <Verdict status={preview.result.status} text={preview.text} />
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
