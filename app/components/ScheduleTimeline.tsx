// 12 か月の作付けスケジュール。区画で使われている作物ごとに、種まき/植え付け（塗り）と
// 収穫（斜線ハッチ）の窓を月軸で表示する。色＋ハッチ＋形で色覚に依存しない。
import type { Garden } from "../lib/types";
import { buildScheduleRows, summarizeMonths } from "../lib/schedule.mjs";
import { cropById } from "../lib/crops.mjs";

const MONTH_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

export function ScheduleTimeline({ garden }: { garden: Garden }) {
  const usedCrops = garden.beds.flatMap((b) =>
    b.plantings.map((p) => ({ cropId: p.cropId })),
  );
  const rows = buildScheduleRows(usedCrops, cropById);

  if (rows.length === 0) {
    return (
      <p className="muted">
        作物を登録すると、種まき・植え付けと収穫の時期が月ごとに並びます。
      </p>
    );
  }

  return (
    <>
      <div className="timeline">
        <div className="timeline-inner">
          <div className="timeline-row is-head" aria-hidden="true">
            <div className="timeline-crop">作物</div>
            {MONTH_NUMS.map((m) => (
              <div className="timeline-month" key={m}>
                {m}
              </div>
            ))}
          </div>
          {rows.map((row) => {
            const crop = cropById(row.cropId);
            const summary = `${row.nameJa}。種まき・植え付け ${summarizeMonths(
              crop ? crop.sowMonths : [],
            )}、収穫 ${summarizeMonths(crop ? crop.harvestMonths : [])}`;
            return (
              <div className="timeline-row" key={row.cropId}>
                <div className="timeline-crop">
                  <span aria-hidden="true">{row.nameJa}</span>
                  <span className="visually-hidden">{summary}</span>
                </div>
                {MONTH_NUMS.map((m, i) => (
                  <div className="timeline-cell" key={m} aria-hidden="true">
                    {row.sow[i] && <span className="tl-bar sow" />}
                    {row.harvest[i] && <span className="tl-bar harvest" />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="tl-legend">
        <span>
          <span className="tl-swatch sow" aria-hidden="true" />
          種まき・植え付け
        </span>
        <span>
          <span className="tl-swatch harvest" aria-hidden="true" />
          収穫
        </span>
      </div>
    </>
  );
}
