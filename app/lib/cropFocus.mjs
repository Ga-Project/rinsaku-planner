// 畑めぐり（rinsaku-planner）— 「この野菜を、どの区画に植えられるか」の判定。
//
// ■ なぜこの層が要るか
//   野菜ページ（/yasai/<id>/）から来た人は、既に育てたい野菜が決まっている。
//   これまでその導線はトップの「畑をつくる」に合流していて、せっかく名前を持って
//   来たのに、着いた先では自分でもう一度その野菜を探し直す必要があった。
//   ここは向きを逆にして「野菜 → 植えられる区画」を出す。
//
// ■ 年数がどちら向きの数かを間違えない（この層で最も壊しやすいところ）
//   rotation.mjs の bedStatus() は「その区画に最後に植えた作物」の rotationYears を
//   requiredYears に採る。しかしここで要るのは **これから植える野菜自身** の値。
//   例: トマト（4年）を作った区画にジャガイモ（3年）を植えるなら要るのは 3 年で、
//   トマトの 4 年ではない。マスタ 59 件中 20 件は科の代表値と自身の値が違うため、
//   取り違えると製品の別の場所（PlantNow・BedEditor のプレビュー）と判定が食い違う。
//   したがって判定は必ず evaluateRotation() に「植える側の野菜」の値を渡して行い、
//   ここで独自に gap を数え直さない。
//
// ■ 連作の話しかしない
//   ここが答えるのは「連作の面で植えられるか」だけで、いまが種まきの適期かは見ない
//   （適期は PlantNow の担当）。両方を1つの判定に混ぜると、9月にトマトを
//   「植えられます」と言い切ってしまい、同じ製品の中で矛盾する。
//   時期は呼び出し側が作物マスタの sowMonths から別に示す。
//
// ■ リンクを出す側と読む側を1つにする
//   野菜ページが書き出すリンク（?crop=…）と、プランナーがそれを読む処理は
//   別ファイルにあり、片方だけ変えても型もテストも書き出し検査も反応しない
//   （クエリ名を1文字変えるだけで機能全体が黙って死ぬ）。両方をこの層の
//   CROP_PARAM / plannerHrefForCrop / focusCropIdFromSearch に集約し、
//   往復をテストで固定する。
//
// UI 非依存・副作用なし（Date も参照しない＝年は引数で受け取る）。

import { evaluateRotation } from "./rotation.mjs";

/**
 * @typedef {import("./types").Crop} Crop
 * @typedef {import("./types").Bed} Bed
 * 戻り値の形の正は app/lib/types.ts（suggest.mjs と types.ts の関係に合わせる）。
 * @typedef {import("./types").FocusVerdict} FocusVerdict
 * @typedef {import("./types").FocusRecord} FocusRecord
 * @typedef {import("./rotation.mjs").PastPlanting} PastPlanting
 */

/** 「植えたい野菜」を渡すクエリ名。リンクを書く側と読む側の唯一の出典。 */
export const CROP_PARAM = "crop";

/** 区画の一覧（プランナー本体）のアンカー。 */
const PLANNER_ANCHOR = "app";

/**
 * 野菜ページからプランナーへのリンク。next/link に渡す前提の相対パスで、
 * basePath は Link が前置する（素の <a href> にしない）。
 * @param {string} slug
 */
export function plannerHrefForCrop(slug) {
  return `/?${CROP_PARAM}=${encodeURIComponent(slug)}#${PLANNER_ANCHOR}`;
}

/**
 * URL のクエリ文字列から「植えたい野菜」を取り出す。
 *
 * 外から来た文字列をそのまま状態に入れない。存在しない id を保持すると
 * 「その野菜の区画」という見出しだけが出て中身が空になる、あるいは
 * 画面に生の文字列が出る（＝任意の文字列を画面に載せられる）。
 *
 * @param {string} search `window.location.search`（"?crop=tomato" 形式・先頭 ? は任意）
 * @param {Crop[]} crops 作物マスタ
 * @returns {string | null} 実在する作物 id、無ければ null
 */
export function focusCropIdFromSearch(search, crops) {
  if (typeof search !== "string") return null;
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get(CROP_PARAM);
  return normalizeFocusCropId(raw, crops);
}

/**
 * 受け取った値を、作物マスタに実在する id だけに絞る。
 * @param {unknown} raw
 * @param {Crop[]} crops
 * @returns {string | null}
 */
export function normalizeFocusCropId(raw, crops) {
  if (typeof raw !== "string" || raw === "") return null;
  const list = Array.isArray(crops) ? crops : [];
  return list.some((c) => c && c.id === raw) ? raw : null;
}

/**
 * 絞り込みを解除したあとの URL（クエリから crop だけ落とす）。
 * 残したまま再読み込みすると、解除したはずの野菜がまた前面に出る。
 * @param {string} href 現在の絶対URL
 * @returns {string} 同じオリジンの path?query#hash（履歴の置き換えに渡す）
 */
export function hrefWithoutCrop(href) {
  const url = new URL(href);
  url.searchParams.delete(CROP_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 表示順（軽い順）。植えられる区画から先に見せる。 */
const STATUS_ORDER = { ok: 0, caution: 1, ng: 2 };

/**
 * 「その野菜を targetYear に植える」場合の判定を、区画ごとに返す。
 *
 * status は連作判定そのもの（ok / caution / ng）で、ここで置き換えない。
 * 置き換えると製品の別の場所（BedEditor のプレビュー・PlantNow）と食い違う。
 *
 * 「その年その区画に同じ科を既に記録している」ことは、判定を上書きせず
 * sameYearRecord に**注記**として添える。判定を差し替えると
 *   - 別の作物（ナス）の記録を、いま見ている野菜（トマト）の記録として言ってしまう
 *   - あき年数0の科（ネギ→ニラ等）で、実際には植えられる区画を落としてしまう
 *   - あき0年という最も重い衝突が、軽い衝突より上に・弱い色で並ぶ
 * という壊れ方をする。注記なら判定はそのままで、事情だけを足せる。
 *
 * @param {Bed[]} beds 対象の菜園の区画
 * @param {Crop} crop 植えようとしている野菜（この野菜の rotationYears を使う）
 * @param {(cropId: string) => (Crop | undefined)} cropLookup 履歴の cropId から作物を引く
 * @param {number} targetYear 植えようとしている年（西暦・整数）
 * @returns {FocusVerdict[]} 判定の軽い順 → 元の並び順
 */
export function focusBedVerdicts(beds, crop, cropLookup, targetYear) {
  if (!crop || typeof crop.familyKey !== "string") return [];
  if (!Number.isInteger(targetYear)) return [];

  const list = (Array.isArray(beds) ? beds : []).filter(
    (b) => b && typeof b.id === "string",
  );

  return list
    .map((bed, index) => {
      // 区画の履歴を「科 × 年」に落とす（マスタに無い id は判定から外す）。
      /** @type {PastPlanting[]} */
      const past = (Array.isArray(bed.plantings) ? bed.plantings : [])
        .map((p) => {
          if (!p || typeof p.cropId !== "string" || !Number.isInteger(p.year)) {
            return null;
          }
          const c = cropLookup(p.cropId);
          return c ? { familyKey: c.familyKey, year: p.year } : null;
        })
        .filter((p) => p !== null);

      // 必要年数は「植える側」の野菜の値。ここを区画側の値にすると向きが逆になる。
      const result = evaluateRotation(
        past,
        crop.familyKey,
        crop.rotationYears,
        targetYear,
      );

      // この区画に記録している同じ科の作付けを、年で2つに分けて注記にする
      // （どちらも判定は変えない）。何を記録したのかは名前で持つ:
      // 「ナスを記録している」を「トマトを記録ずみ」と言い換えると、
      // 利用者のデータについて事実でないことを言うことになる。
      const sameFamilyRecords = (
        Array.isArray(bed.plantings) ? bed.plantings : []
      )
        .map((p) => {
          if (!p || typeof p.cropId !== "string" || !Number.isInteger(p.year)) {
            return null;
          }
          const c = cropLookup(p.cropId);
          return c && c.familyKey === crop.familyKey
            ? { cropId: c.id, nameJa: c.nameJa, year: p.year }
            : null;
        })
        .filter((x) => x !== null);

      // その年ちょうどの記録。
      const sameYear = sameFamilyRecords.filter((r) => r.year === targetYear);

      // targetYear より後の年の記録。判定（evaluateRotation）は targetYear までの
      // 履歴しか見ないので、ここを拾わないと「記録はありません」と言いながら
      // グリッドには翌年の作付けが出ている、という食い違いが利用者に見える。
      const later = sameFamilyRecords
        .filter((r) => r.year > targetYear)
        .sort((a, b) => a.year - b.year);

      return {
        index,
        verdict: {
          bedId: bed.id,
          label: bed.label,
          status: result.status,
          targetYear,
          lastSameFamilyYear: result.lastSameFamilyYear,
          // 「あと何年あければ植えられるか」。避けたい区画が複数あるとき、
          // あと1年の区画と あと4年の区画を見分けるための数字。
          remainingYears:
            result.status === "ng" && result.gapYears !== null
              ? result.requiredYears - result.gapYears
              : null,
          requiredYears: result.requiredYears,
          gapYears: result.gapYears,
          reason: result.reason,
          // その年に記録ずみの同じ科（無ければ空）。判定には影響しない。
          sameYearRecord: sameYear,
          // targetYear より後に記録している同じ科（無ければ空）。判定には影響しない。
          laterRecord: later,
        },
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.verdict.status] - STATUS_ORDER[b.verdict.status] ||
        a.index - b.index,
    )
    .map((x) => x.verdict);
}

/**
 * 区画1件ぶんの補足（判定に添える短い語）。画面が2箇所でこの規則を
 * 別々に持たないよう、ここを唯一の出典にする。
 * @param {FocusVerdict} v
 * @returns {string}
 */
export function verdictNote(v) {
  if (!v) return "";
  if (v.status === "ng" && v.remainingYears !== null) {
    return `あと${v.remainingYears}年`;
  }
  return "";
}

/**
 * 判定の根拠を1行にする。
 *
 * ここは判定エンジンの reason を画面へそのまま流さない。reason は
 * 「2024年に同じ科を植えています。あと2年あけるのがおすすめです（目安4年）。」
 * のように、あき年数をもう一度言う。チップには verdictNote（「あと2年」）が
 * すでに出ているので、同じ数が1枚の中に2回現れ、同じ1件の作付けを2つの文が
 * 繰り返すことになる。狭い画面ではこれだけで1チップが7行になり、利用者が
 * 見に来たグリッドが画面の外へ押し出される。
 *
 * そこで根拠は「いつ・どれだけ・目安いくつ」の事実だけに畳む。
 * reason は読み上げ用の名前（chip の aria-label）に残すので情報は失われない。
 *
 * @param {FocusVerdict} v
 * @returns {string}
 */
export function verdictDetail(v) {
  if (!v) return "";
  if (v.requiredYears <= 0) return "続けて植えやすい科です";
  if (v.lastSameFamilyYear === null) {
    // 「記録はありません」と裸で言わない。見ているのは targetYear までの履歴で、
    // それより後の作付けは laterNote() が別行で言う。
    return `${v.targetYear}年までに同じ科の記録はありません（目安${v.requiredYears}年）`;
  }
  if (v.gapYears === null) return `${v.lastSameFamilyYear}年に同じ科`;
  return `${v.lastSameFamilyYear}年に同じ科／あき${v.gapYears}年・目安${v.requiredYears}年`;
}

/**
 * その年すでに記録している同じ科の作付けを、1行の注記にする。
 * 判定とは別の情報なので、判定文とは別の行に置く。
 * @param {FocusVerdict} v
 * @param {number} targetYear
 * @returns {string} 記録が無ければ空文字
 */
export function sameYearNote(v, targetYear) {
  const list = v && Array.isArray(v.sameYearRecord) ? v.sameYearRecord : [];
  if (list.length === 0) return "";
  const names = [...new Set(list.map((r) => r.nameJa))].join("・");
  return `${targetYear}年はこの区画に${names}を記録しています。`;
}

/**
 * targetYear より後に記録している同じ科の作付けを、1行の注記にする。
 *
 * これが無いと、翌季の計画を先に入れている区画（年の入力は 1900〜3000 を
 * 受けるので、これは正常な使い方）で「同じ科の記録はありません」とだけ出て、
 * すぐ上のグリッドが「トマト（2030）」と表示しているのと食い違う。
 * 判定は変えず（判定は targetYear までの履歴で行うのがこの製品の仕様）、
 * 見えている事実と判定の範囲のズレを、利用者に言葉で渡す。
 *
 * @param {FocusVerdict} v
 * @returns {string} 記録が無ければ空文字
 */
export function laterNote(v) {
  const list = v && Array.isArray(v.laterRecord) ? v.laterRecord : [];
  if (list.length === 0) return "";
  const parts = [...new Set(list.map((r) => `${r.year}年に${r.nameJa}`))];
  return `${parts.join("、")}の予定があります（この判定には含めていません）。`;
}

/** 判定ごとの「◯区画」の言い方。見出しを組み立てる唯一の出典。 */
const GROUP_LABEL = {
  ok: "そのまま植えられる区画",
  caution: "間隔に注意すれば植えられる区画",
  ng: "いまは避けたい区画",
};

/** 植えられる区画しか無いときの言い方（区画1つ）。「1区画すべて」と言わない。 */
const ONLY_PHRASE = {
  /** @type {(name: string) => string} */
  ok: (name) => `この区画に${name}を植えられます。`,
  /** @type {(name: string) => string} */
  caution: (name) => `この区画は、間隔に注意すれば${name}を植えられます。`,
};

/** 植えられる区画しか無いときの言い方（区画2つ以上）。「◯区画のうち◯区画」を避ける。 */
const ALL_PHRASE = {
  /** @type {(n: number, name: string) => string} */
  ok: (n, name) => `${n}区画すべてに${name}を植えられます。`,
  /** @type {(n: number, name: string) => string} */
  caution: (n, name) => `${n}区画すべて、間隔に注意すれば${name}を植えられます。`,
};

/**
 * 区画ごとの判定を、見出し1行ぶんに畳む。
 *
 * ■ 数えた群は落とさない
 *   caution を ok に足し込んで一言にしない。この製品は3値で判定しているので、
 *   見出しだけ2値に潰すと判定が弱くなる。避けたい区画の数も必ず出す
 *   （「植えられる」側だけ言うと、避けたい区画があること自体が見出しから消える）。
 *
 * ■ 「◯区画のうち◯区画」と言わない
 *   非ゼロの群が1つしか無いときに「のうち」で受けると
 *   「3区画のうち、3区画は間隔に注意して…」という、何も絞っていない文になる。
 *   その場合は「すべて」で言い切る。
 *
 * ■ 助詞を衝突させない
 *   群ごとに「に」「は」を混ぜると「1区画に」と「1区画は」が並ぶ。
 *   群は体言止めの名詞句（GROUP_LABEL）にして「〜が◯区画」で揃える。
 *
 * @param {FocusVerdict[]} verdicts
 * @param {string} cropName 野菜の表示名
 * @returns {{ok: number, caution: number, ng: number, total: number, headline: string}}
 */
export function summarizeFocus(verdicts, cropName) {
  const list = (Array.isArray(verdicts) ? verdicts : []).filter((v) => v);
  const count = (st) => list.filter((v) => v.status === st).length;
  const ok = count("ok");
  const caution = count("caution");
  const ng = count("ng");
  const total = list.length;

  if (total === 0) {
    return {
      ok,
      caution,
      ng,
      total,
      headline: `区画をつくると、${cropName}を植えられるかどうかが出ます。`,
    };
  }

  // 植えられる区画が1つも無いとき（壊れた要素しか無い場合もここに落ちる）。
  if (ok === 0 && caution === 0) {
    return {
      ok,
      caution,
      ng,
      total,
      headline: `いまの記録では、${cropName}をすぐ植えられる区画はありません。`,
    };
  }

  // 非ゼロの群だけを、深刻度の軽い順に並べる。
  const present = [
    { key: "ok", n: ok },
    { key: "caution", n: caution },
    { key: "ng", n: ng },
  ].filter((g) => g.n > 0);

  // 群が1つ＝全区画が同じ判定。「◯区画のうち◯区画」と言わない。
  if (present.length === 1) {
    const only = present[0];
    return {
      ok,
      caution,
      ng,
      total,
      headline:
        total === 1
          ? ONLY_PHRASE[only.key](cropName)
          : ALL_PHRASE[only.key](total, cropName),
    };
  }

  const parts = present.map((g) => `${GROUP_LABEL[g.key]}が${g.n}区画`);
  return {
    ok,
    caution,
    ng,
    total,
    headline: `${cropName}を植えるなら、${total}区画のうち${parts.join("、")}です。`,
  };
}
