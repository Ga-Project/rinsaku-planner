"use client";

import { useRef } from "react";
import type { AppState } from "../lib/types";
import { serialize, parseImport } from "../lib/storage.mjs";
import { IconDownload, IconUpload } from "./icons";

export function DataControls({
  state,
  onImport,
  onError,
}: {
  state: AppState;
  onImport: (next: AppState) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    try {
      const blob = new Blob([serialize(state)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `hatakemeguri-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 一部ブラウザでの DL 中断を避けるため revoke を遅延する。
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      onError("書き出しに失敗しました。もう一度お試しください。");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを連続選択できるようにリセット
    if (!file) return;
    try {
      const text = await file.text();
      const { ok, state: next, error } = parseImport(text);
      if (ok && next) {
        onImport(next);
      } else {
        onError(error ?? "ファイルを読み込めませんでした。");
      }
    } catch {
      onError("ファイルの読み込みに失敗しました。");
    }
  }

  return (
    <div className="toolbar">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleExport}
      >
        <IconDownload />
        バックアップを書き出す
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => fileRef.current?.click()}
      >
        <IconUpload />
        取り込む
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        aria-label="バックアップファイルを取り込む"
        onChange={handleFile}
      />
    </div>
  );
}
