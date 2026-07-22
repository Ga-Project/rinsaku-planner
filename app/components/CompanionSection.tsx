"use client";

import type { Garden } from "../lib/types";
import { cropById } from "../lib/crops.mjs";
import { IconSprout } from "./icons";

/** 区画で使われている作物の、相性のよい/避けたい野菜（コンパニオンプランツ）の提案。 */
export function CompanionSection({ garden }: { garden: Garden }) {
  const usedIds = [
    ...new Set(garden.beds.flatMap((b) => b.plantings.map((p) => p.cropId))),
  ];
  const crops = usedIds
    .map((id) => cropById(id))
    .filter((c): c is NonNullable<ReturnType<typeof cropById>> => c != null);

  return (
    <section className="app-section" aria-labelledby="companion-heading">
      <div className="section-head">
        <h2 id="companion-heading">
          <span className="with-marker">
            <span className="section-marker" aria-hidden="true">
              <IconSprout />
            </span>
            相性のよい野菜
          </span>
        </h2>
      </div>
      {crops.length === 0 ? (
        <p className="muted">
          区画に作物を登録すると、近くに植えると相性のよい/避けたい野菜（コンパニオンプランツ）を提案します。
        </p>
      ) : (
        <div className="companion-grid">
          {crops.map((c) => (
            <article className="card" key={c.id}>
              <h3 style={{ marginTop: 0 }}>{c.nameJa}</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                相性のよい野菜
              </p>
              <div className="companion-tags">
                {c.companionGood.length > 0 ? (
                  c.companionGood.map((g) => (
                    <span className="badge badge-ok" key={g}>
                      {g}
                    </span>
                  ))
                ) : (
                  <span className="muted">特になし</span>
                )}
              </div>
              {c.companionBad.length > 0 && (
                <>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    近くを避けたい野菜
                  </p>
                  <div className="companion-tags">
                    {c.companionBad.map((b) => (
                      <span className="badge badge-warn" key={b}>
                        {b}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
