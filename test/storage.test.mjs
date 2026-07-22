// 保存・読み込み・エクスポート/インポートのテスト。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  validateState,
  serialize,
  parseImport,
  loadState,
  saveState,
  newId,
  STORAGE_KEY,
  CURRENT_VERSION,
} from "../app/lib/storage.mjs";

/** テスト用の最小有効状態を作る。 */
function sampleState() {
  return {
    version: CURRENT_VERSION,
    gardens: [
      {
        id: "g1",
        name: "わたしの菜園",
        cols: 4,
        rows: 3,
        beds: [
          {
            id: "b1",
            label: "畝1",
            kind: "row",
            col: 0,
            row: 0,
            plantings: [{ id: "p1", cropId: "tomato", year: 2026 }],
          },
        ],
      },
    ],
    activeGardenId: "g1",
    pro: false,
  };
}

test("emptyState: 区画なしの初期状態", () => {
  const s = emptyState();
  assert.equal(s.version, CURRENT_VERSION);
  assert.deepEqual(s.gardens, []);
  assert.equal(s.activeGardenId, null);
  assert.equal(s.pro, false);
});

test("newId: 一意なプレフィックス付き id", () => {
  const a = newId("b");
  const b = newId("b");
  assert.match(a, /^b_/);
  assert.notEqual(a, b);
});

test("validateState: 正常な状態をそのまま通す", () => {
  const { ok, state, error } = validateState(sampleState());
  assert.equal(ok, true);
  assert.equal(error, null);
  assert.equal(state.gardens.length, 1);
  assert.equal(state.gardens[0].beds[0].plantings[0].cropId, "tomato");
});

test("validateState: 上位構造が壊れていれば ok:false", () => {
  assert.equal(validateState(null).ok, false);
  assert.equal(validateState(42).ok, false);
  assert.equal(validateState({}).ok, false); // gardens なし
  assert.equal(validateState({ gardens: "x" }).ok, false);
});

test("validateState: 不正な bed/planting は破棄して復旧", () => {
  const dirty = {
    gardens: [
      {
        id: "g1",
        beds: [
          null,
          {
            id: "b1",
            plantings: [
              { cropId: "tomato", year: 2026 },
              { cropId: "", year: 2026 }, // cropId 空 → 破棄
              { cropId: "x", year: NaN }, // year 不正 → 破棄
              "junk",
            ],
          },
        ],
      },
    ],
  };
  const { ok, state } = validateState(dirty);
  assert.equal(ok, true);
  assert.equal(state.gardens[0].beds.length, 1);
  assert.equal(state.gardens[0].beds[0].plantings.length, 1);
  assert.equal(state.gardens[0].beds[0].plantings[0].cropId, "tomato");
});

test("validateState: activeGardenId が無効なら先頭の菜園に補正", () => {
  const { state } = validateState({
    gardens: [{ id: "g9", beds: [] }],
    activeGardenId: "does-not-exist",
  });
  assert.equal(state.activeGardenId, "g9");
});

test("validateState: 圏外の区画が消えないようグリッドを広げる", () => {
  // 4x3 グリッドに (10,8) の区画 → そのままだと描画されず孤立する。cols/rows を広げて収める。
  const { ok, state } = validateState({
    gardens: [
      {
        id: "g1",
        cols: 4,
        rows: 3,
        beds: [{ id: "b1", col: 10, row: 8, plantings: [] }],
      },
    ],
  });
  assert.equal(ok, true);
  assert.equal(state.gardens[0].beds.length, 1);
  assert.ok(state.gardens[0].cols >= 11, `cols=${state.gardens[0].cols}`);
  assert.ok(state.gardens[0].rows >= 9, `rows=${state.gardens[0].rows}`);
});

test("validateState: 同一セルの区画衝突を空きセルへ再配置（消えない）", () => {
  const { state } = validateState({
    gardens: [
      {
        id: "g1",
        cols: 4,
        rows: 3,
        beds: [
          { id: "b1", col: 0, row: 0, plantings: [] },
          { id: "b2", col: 0, row: 0, plantings: [] },
          { id: "b3", col: 0, row: 0, plantings: [] },
        ],
      },
    ],
  });
  const beds = state.gardens[0].beds;
  assert.equal(beds.length, 3, "全区画が残る");
  const cells = new Set(beds.map((b) => `${b.col},${b.row}`));
  assert.equal(cells.size, 3, "セルは一意（衝突解消）");
});

test("validateState: グリッド寸法を妥当な範囲にクランプ", () => {
  const { state } = validateState({
    gardens: [{ id: "g1", cols: 9999, rows: -2, beds: [] }],
  });
  assert.ok(state.gardens[0].cols <= 24);
  assert.ok(state.gardens[0].rows >= 1);
});

test("serialize → parseImport の往復で同値", () => {
  const s = sampleState();
  const text = serialize(s);
  const { ok, state } = parseImport(text);
  assert.equal(ok, true);
  assert.deepEqual(state, s);
});

test("parseImport: 不正な JSON は ok:false", () => {
  assert.equal(parseImport("{ not json").ok, false);
  assert.equal(parseImport("").ok, false);
});

test("loadState / saveState: 注入したストレージで往復", () => {
  const mem = new Map();
  const store = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
  };
  assert.equal(saveState(sampleState(), store), true);
  assert.ok(mem.get(STORAGE_KEY).length > 0);
  const loaded = loadState(store);
  assert.equal(loaded.gardens[0].beds[0].plantings[0].cropId, "tomato");
});

test("loadState: 空ストレージは emptyState", () => {
  const store = { getItem: () => null, setItem: () => {} };
  assert.deepEqual(loadState(store), emptyState());
});

test("loadState: 壊れた保存値でも落ちずに emptyState", () => {
  const store = { getItem: () => "<<broken>>", setItem: () => {} };
  assert.deepEqual(loadState(store), emptyState());
});

test("saveState: 書き込み失敗（容量超過等）は false を返す", () => {
  const store = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(saveState(sampleState(), store), false);
});
