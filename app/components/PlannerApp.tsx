"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, Bed, Garden } from "../lib/types";
import { loadState, saveState, emptyState, newId } from "../lib/storage.mjs";
import { BedGrid } from "./BedGrid";
import { BedEditor } from "./BedEditor";
import { ScheduleTimeline } from "./ScheduleTimeline";
import { DataControls } from "./DataControls";
import { CompanionSection } from "./CompanionSection";
import { IconPlus, IconSprout, IconPrint } from "./icons";

const MAX_DIM = 12;

function defaultGarden(): Garden {
  return { id: newId("g"), name: "わたしの菜園", cols: 4, rows: 3, beds: [] };
}

export function PlannerApp() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // 初回マウントで localStorage から読み込む（SSR とのハイドレーション不整合を避ける）。
  useEffect(() => {
    const loaded = loadState();
    if (loaded.gardens.length === 0) {
      const g = defaultGarden();
      loaded.gardens = [g];
      loaded.activeGardenId = g.id;
    }
    setState(loaded);
    setMounted(true);
  }, []);

  // 変更を保存（失敗は通知。データは画面に残る）。
  useEffect(() => {
    if (!mounted) return;
    if (!saveState(state)) {
      setError(
        "保存できませんでした。保存領域がいっぱいか、プライベートブラウズの可能性があります。",
      );
    }
  }, [state, mounted]);

  // 区画を選んだら編集パネルを表示位置までスクロールし、フォーカスを移す
  // （モバイルで見失わない・SR/キーボード利用者にパネル出現を伝える）。
  useEffect(() => {
    if (selectedBedId && editorRef.current) {
      editorRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      editorRef.current.focus();
    }
  }, [selectedBedId]);

  const activeGarden =
    state.gardens.find((g) => g.id === state.activeGardenId) ??
    state.gardens[0] ??
    null;

  const updateActiveGarden = useCallback((updater: (g: Garden) => Garden) => {
    setState((prev) => {
      const id = prev.activeGardenId ?? prev.gardens[0]?.id ?? null;
      return {
        ...prev,
        gardens: prev.gardens.map((g) => (g.id === id ? updater(g) : g)),
      };
    });
  }, []);

  const addBedAt = useCallback(
    (col: number, row: number) => {
      const id = newId("b");
      updateActiveGarden((g) => ({
        ...g,
        beds: [
          ...g.beds,
          {
            id,
            label: `区画${g.beds.length + 1}`,
            kind: "row",
            col,
            row,
            plantings: [],
          },
        ],
      }));
      setSelectedBedId(id);
    },
    [updateActiveGarden],
  );

  const updateBed = useCallback(
    (bedId: string, patch: Partial<Pick<Bed, "label" | "kind">>) => {
      updateActiveGarden((g) => ({
        ...g,
        beds: g.beds.map((b) => (b.id === bedId ? { ...b, ...patch } : b)),
      }));
    },
    [updateActiveGarden],
  );

  const deleteBed = useCallback(
    (bedId: string) => {
      updateActiveGarden((g) => ({
        ...g,
        beds: g.beds.filter((b) => b.id !== bedId),
      }));
      setSelectedBedId((cur) => (cur === bedId ? null : cur));
    },
    [updateActiveGarden],
  );

  const addPlanting = useCallback(
    (bedId: string, cropId: string, year: number) => {
      updateActiveGarden((g) => ({
        ...g,
        beds: g.beds.map((b) =>
          b.id === bedId
            ? {
                ...b,
                plantings: [...b.plantings, { id: newId("p"), cropId, year }],
              }
            : b,
        ),
      }));
    },
    [updateActiveGarden],
  );

  const removePlanting = useCallback(
    (bedId: string, plantingId: string) => {
      updateActiveGarden((g) => ({
        ...g,
        beds: g.beds.map((b) =>
          b.id === bedId
            ? {
                ...b,
                plantings: b.plantings.filter((p) => p.id !== plantingId),
              }
            : b,
        ),
      }));
    },
    [updateActiveGarden],
  );

  const expandGrid = useCallback(
    (dim: "cols" | "rows") => {
      updateActiveGarden((g) => ({
        ...g,
        [dim]: Math.min(MAX_DIM, g[dim] + 1),
      }));
    },
    [updateActiveGarden],
  );

  const addGarden = useCallback(() => {
    const g = defaultGarden();
    setState((prev) => ({
      ...prev,
      gardens: [...prev.gardens, g],
      activeGardenId: g.id,
    }));
    setSelectedBedId(null);
  }, []);

  const switchGarden = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeGardenId: id }));
    setSelectedBedId(null);
  }, []);

  const renameGarden = useCallback(
    (name: string) => {
      updateActiveGarden((g) => ({ ...g, name }));
    },
    [updateActiveGarden],
  );

  const deleteGarden = useCallback((id: string) => {
    setState((prev) => {
      if (prev.gardens.length <= 1) return prev;
      const gardens = prev.gardens.filter((g) => g.id !== id);
      return {
        ...prev,
        gardens,
        activeGardenId:
          prev.activeGardenId === id
            ? (gardens[0]?.id ?? null)
            : prev.activeGardenId,
      };
    });
    setSelectedBedId(null);
  }, []);

  // --- 描画 ---

  if (!mounted) {
    return (
      <section className="app-section" aria-busy="true">
        <span className="visually-hidden">読み込み中です</span>
        <div
          className="bed-grid"
          style={{ "--cols": 4 } as React.CSSProperties}
          aria-hidden="true"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div className="skeleton" key={i} style={{ minHeight: 94 }} />
          ))}
        </div>
      </section>
    );
  }

  if (!activeGarden) {
    return null;
  }

  const selectedBed =
    activeGarden.beds.find((b) => b.id === selectedBedId) ?? null;

  return (
    <>
      {error && (
        <div
          className="alert alert-err no-print"
          role="alert"
          style={{ marginBottom: "var(--sp-6)" }}
        >
          <span className="grow">{error}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setError(null)}
          >
            閉じる
          </button>
        </div>
      )}

      {/* 菜園の切り替え（複数作れる）。1つのときは「新しい菜園」だけ出す。 */}
      <div
        className="garden-tabs no-print"
        style={{ marginBottom: "var(--sp-4)" }}
      >
        {state.gardens.length > 1 &&
          state.gardens.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`btn ${g.id === activeGarden.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => switchGarden(g.id)}
            >
              {g.name}
            </button>
          ))}
        <button type="button" className="btn btn-ghost" onClick={addGarden}>
          <IconPlus />
          新しい菜園
        </button>
      </div>

      <section className="app-section" aria-label="菜園のグリッド">
        <div className="section-head">
          <div>
            <input
              type="text"
              value={activeGarden.name}
              aria-label="菜園の名前"
              maxLength={30}
              onChange={(e) => renameGarden(e.target.value)}
              style={{ maxWidth: "16rem", fontWeight: "var(--fw-bold)" }}
            />
            <p className="muted">
              セルをタップして区画を作り、育てる作物と年を登録します。同じ科を続けて植えていないか色と印で判定します。
            </p>
          </div>
          {state.gardens.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost no-print"
              onClick={() => deleteGarden(activeGarden.id)}
            >
              この菜園を削除
            </button>
          )}
        </div>

        {activeGarden.beds.length === 0 ? (
          <div className="empty-state card">
            <span className="card-icon" aria-hidden="true">
              <IconSprout style={{ fontSize: "1.75rem" }} />
            </span>
            <h3>まだ畑がありません</h3>
            <p className="muted">
              最初の区画を置いて、育てたい野菜を選びましょう。
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => addBedAt(0, 0)}
            >
              <IconPlus />
              区画を追加する
            </button>
          </div>
        ) : (
          <>
            <BedGrid
              garden={activeGarden}
              selectedBedId={selectedBedId}
              onSelectBed={setSelectedBedId}
              onAddBedAt={addBedAt}
            />
            <div
              className="toolbar no-print"
              style={{ marginTop: "var(--sp-3)" }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                disabled={activeGarden.cols >= MAX_DIM}
                onClick={() => expandGrid("cols")}
              >
                <IconPlus />
                列を増やす
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={activeGarden.rows >= MAX_DIM}
                onClick={() => expandGrid("rows")}
              >
                <IconPlus />
                行を増やす
              </button>
            </div>
          </>
        )}

        <div ref={editorRef} tabIndex={-1} style={{ outline: "none" }}>
          {selectedBed ? (
            <BedEditor
              key={selectedBed.id}
              bed={selectedBed}
              currentYear={new Date().getFullYear()}
              onUpdateBed={(patch) => updateBed(selectedBed.id, patch)}
              onAddPlanting={(cropId, year) =>
                addPlanting(selectedBed.id, cropId, year)
              }
              onRemovePlanting={(pid) => removePlanting(selectedBed.id, pid)}
              onDeleteBed={() => deleteBed(selectedBed.id)}
            />
          ) : (
            activeGarden.beds.length > 0 && (
              <p className="muted" style={{ marginTop: "var(--sp-4)" }}>
                区画を選ぶと、作物の登録と連作の判定ができます。
              </p>
            )
          )}
        </div>
      </section>

      <section className="app-section" aria-labelledby="timeline-heading">
        <div className="section-head">
          <h2 id="timeline-heading">
            <span className="with-marker">
              <span className="section-marker" aria-hidden="true">
                <IconSprout />
              </span>
              作付けスケジュール
            </span>
          </h2>
        </div>
        <ScheduleTimeline garden={activeGarden} />
      </section>

      <CompanionSection garden={activeGarden} />

      <section className="app-section no-print" aria-labelledby="data-heading">
        <div className="section-head">
          <h2 id="data-heading">
            <span className="with-marker">
              <span className="section-marker" aria-hidden="true">
                <IconSprout />
              </span>
              計画の保存・印刷
            </span>
          </h2>
        </div>
        <p className="muted">
          計画はこの端末に保存されます。機種変更や万一に備えてファイルに書き出して保管したり、印刷・PDF
          にして畑に持ち出せます。
        </p>
        <DataControls
          state={state}
          onImport={(next) => {
            // 空（または全件無効でフィルタ後に空）の取り込みでも画面が真っ白に
            // ならないよう、菜園が無ければ既定の菜園を用意する。
            let imported = next;
            if (imported.gardens.length === 0) {
              const g = defaultGarden();
              imported = { ...imported, gardens: [g], activeGardenId: g.id };
            }
            setState(imported);
            setSelectedBedId(null);
          }}
          onError={setError}
        />
        <div className="toolbar" style={{ marginTop: "var(--sp-3)" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.print()}
          >
            <IconPrint />
            計画を印刷・PDFにする
          </button>
        </div>
      </section>
    </>
  );
}
