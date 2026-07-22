// 区画グリッド。畑の物理配置を cols×rows のセルで表す。
// 各セルは「区画（作物・連作ステート表示）」または「＋追加」。
import type { CSSProperties } from "react";
import type { Garden, Bed } from "../lib/types";
import { bedStatus } from "../lib/rotation.mjs";
import { cropById } from "../lib/crops.mjs";
import { StateBadge } from "./status-ui";
import { IconPlus, IconSeedling } from "./icons";

const KIND_LABEL: Record<Bed["kind"], string> = {
  row: "畝",
  planter: "プランター",
};

// 科ごとの色相（区画セルの芽グリフ・科ドットの tint・純装飾＝科名は常にテキスト併記）。
const FAMILY_HUE: Record<string, number> = {
  solanaceae: 280,
  cucurbitaceae: 150,
  brassicaceae: 90,
  fabaceae: 210,
  apiaceae: 175,
  asteraceae: 48,
  amaranthaceae: 350,
  convolvulaceae: 325,
  poaceae: 60,
  allium: 190,
  zingiberaceae: 30,
  araceae: 120,
  malvaceae: 15,
  rosaceae: 340,
  lamiaceae: 255,
};

export function BedGrid({
  garden,
  selectedBedId,
  onSelectBed,
  onAddBedAt,
}: {
  garden: Garden;
  selectedBedId: string | null;
  onSelectBed: (id: string) => void;
  onAddBedAt: (col: number, row: number) => void;
}) {
  const bedAt = new Map<string, Bed>();
  for (const b of garden.beds) bedAt.set(`${b.col},${b.row}`, b);

  const cells: JSX.Element[] = [];
  for (let r = 0; r < garden.rows; r++) {
    for (let c = 0; c < garden.cols; c++) {
      const bed = bedAt.get(`${c},${r}`);
      if (bed) {
        const status = bedStatus(bed.plantings, cropById);
        const latest =
          status.latestCropId != null
            ? cropById(status.latestCropId)
            : undefined;
        const stateCls =
          status.status === "ng"
            ? "state-ng"
            : status.status === "caution"
              ? "state-caution"
              : "";
        const selected = selectedBedId === bed.id;
        cells.push(
          <button
            type="button"
            key={bed.id}
            className={`bed-cell ${stateCls}`}
            aria-current={selected ? "true" : undefined}
            style={
              latest
                ? ({
                    "--fam": FAMILY_HUE[latest.familyKey] ?? 125,
                  } as CSSProperties)
                : undefined
            }
            onClick={() => onSelectBed(bed.id)}
          >
            <span className="bed-cell-label">{bed.label || "区画"}</span>
            {latest && <span className="bed-cell-fam" aria-hidden="true" />}
            <span className="bed-cell-kind">{KIND_LABEL[bed.kind]}</span>
            <StateBadge status={status.status} />
            <span className="bed-cell-crop">
              {latest ? (
                <>
                  <IconSeedling className="bed-cell-seedling" />
                  {`${latest.nameJa}（${status.latestYear}）`}
                </>
              ) : (
                "作物未登録"
              )}
            </span>
            {selected && <span className="bed-cell-editing">編集中</span>}
          </button>,
        );
      } else {
        cells.push(
          <button
            type="button"
            key={`add-${c}-${r}`}
            className="bed-cell is-add"
            onClick={() => onAddBedAt(c, r)}
          >
            <IconPlus />
            <span className="visually-hidden">
              {c + 1}列{r + 1}行目に区画を追加
            </span>
            <span aria-hidden="true">区画を追加</span>
          </button>,
        );
      }
    }
  }

  return (
    <div
      className="bed-grid"
      style={{ "--cols": garden.cols } as CSSProperties}
      role="group"
      aria-label="区画の配置"
    >
      {cells}
    </div>
  );
}
