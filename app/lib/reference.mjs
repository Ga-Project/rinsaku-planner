// 畑めぐり（rinsaku-planner）— 読み物（早見表・FAQ）のデータ層。
//
// ■ なぜこの層が要るか
//   プランナー本体（PlannerApp）はクライアントコンポーネントなので、静的書き出し
//   （output: "export"）した HTML には中身が出ない。つまり crops.mjs に持っている
//   連作データは「画面では使えるが、読み手にも検索エンジンにも最初は見えない」。
//   このモジュールは同じ crops.mjs から読み物用の形を導出し、サーバー側で描画できる
//   ようにする。数値を手で書き写さないので、マスタを直せば早見表も FAQ も追従する。
//
// ■ 段階（tier）はここにしか置かない
//   「あける年数の重さ」を表す境界は rotationTier() が唯一の定義。表示側（チップの
//   見た目）も文言（早見表のラベル・FAQ 本文）も同じ関数を通す。境界が複数箇所に
//   散ると、早見表が「1年」と書いている科を FAQ が「あけなくてよい」と言う、といった
//   同一ページ内の矛盾が起きる。
//
// ■ 構造化データとの関係
//   FAQPage / WebApplication の JSON-LD はこのモジュールが組み立てる。FAQ は画面に
//   描画しているのと同じ配列を使うため、「構造化データにだけある FAQ」が原理的に
//   発生しない（検索エンジンのガイドライン違反を構造で防ぐ）。

import { FAMILIES, CROPS, FAMILY_HUE } from "./crops.mjs";
import { SITE_URL } from "./site.mjs";

/** 早見表に載せる代表野菜の最大数（多すぎると表が読めなくなる）。 */
const SAMPLE_CROP_LIMIT = 6;

/** 製品名・説明の唯一の出典（メタデータと構造化データで使い回す）。 */
export const SITE_NAME = "畑めぐり";
export const SITE_TITLE = "畑めぐり｜家庭菜園の輪作・連作プランナー";
export const SITE_DESCRIPTION =
  "畝やプランターの区画を並べ、育てる野菜を置くだけ。同じ科を続けて植える連作障害を色と印でひと目で判定し、12か月の作付けスケジュールを管理できる家庭菜園プランナー。登録不要・ブラウザですぐ使えます。";

/**
 * あける年数の段階。境界の定義はここ 1 箇所だけ。
 * - heavy: 土壌病害が残りやすく、家庭菜園で最も注意が要る
 * - mid  : 標準的にあける
 * - light: 1年だけあける
 * - none : あけずに続けられる
 * @param {number} years
 * @returns {"heavy" | "mid" | "light" | "none"}
 */
export function rotationTier(years) {
  if (years >= 4) return "heavy";
  if (years >= 2) return "mid";
  if (years >= 1) return "light";
  return "none";
}

/**
 * あける年数の表示文言。0 は「年数」ではなく状態なので言い換える。
 * @param {number} years
 */
export function rotationYearsLabel(years) {
  return rotationTier(years) === "none" ? "続けて植えやすい" : `${years}年`;
}

/**
 * 科ごとの「あける年数 + 代表的な野菜」を、あける年数の降順で返す。
 * 年数が同じときはマスタ（FAMILIES）の並び順を保つ＝安定ソート。
 * @returns {{ key: string, nameJa: string, rotationYears: number, tier: string, hue: number, crops: string[], cropCount: number }[]}
 */
export function familyReference() {
  return FAMILIES.map((f, i) => {
    const members = CROPS.filter((c) => c.familyKey === f.key);
    return {
      key: f.key,
      nameJa: f.nameJa,
      rotationYears: f.rotationYears,
      tier: rotationTier(f.rotationYears),
      // フォールバックを置かない: 科を足して色相を忘れたらテストで落とす（黙って既定色にしない）。
      hue: FAMILY_HUE[f.key],
      crops: members.slice(0, SAMPLE_CROP_LIMIT).map((c) => c.nameJa),
      cropCount: members.length,
      _order: i,
    };
  })
    .filter((f) => f.cropCount > 0)
    .sort((a, b) => b.rotationYears - a.rotationYears || a._order - b._order)
    .map(({ _order, ...rest }) => rest);
}

/**
 * 指定した科のあける年数をマスタから引く（FAQ の本文が数値を持たないようにする）。
 * @param {string} key
 */
function years(key) {
  const f = FAMILIES.find((x) => x.key === key);
  if (!f) throw new Error(`unknown family: ${key}`);
  return f.rotationYears;
}

/**
 * 指定した段階に属する科の名前（マスタ順）。FAQ 本文に使う。
 * @param {"heavy" | "mid" | "light" | "none"} tier
 */
function familiesInTier(tier) {
  return FAMILIES.filter((f) => rotationTier(f.rotationYears) === tier).map(
    (f) => f.nameJa,
  );
}

/**
 * よくある質問。画面表示（ReferenceSection）と FAQPage 構造化データの唯一の出典。
 * 年数・科の分類は必ず years() / familiesInTier() 経由でマスタから取り、本文に直書きしない。
 * @type {{ q: string, a: string }[]}
 */
export const FAQ = [
  {
    q: "連作障害とは何ですか？",
    a: "同じ場所に同じ仲間の野菜を続けて植えることで、生育が悪くなったり病気が出やすくなったりする現象です。その野菜が好んで吸う養分が土から偏って減ること、特定の病原菌やセンチュウが土に増えることが主な原因とされています。あいだに年数をあける（輪作する）ことが基本の対策です。",
  },
  {
    q: "なぜ野菜そのものではなく「科」で考えるのですか？",
    a: "連作障害の原因になる土の中の病原菌やセンチュウは、野菜の品種ではなく「科」の単位で寄りつくものが多いためです。たとえばトマトのあとにナスやピーマンを植えると、野菜の名前は違ってもどちらもナス科なので、連作したのと同じ状態になります。畑めぐりが科でまとめて判定しているのはこのためです。",
  },
  {
    q: "ナス科は何年あければよいですか？",
    a: `トマト・ナス・ピーマン・ジャガイモなどのナス科は、${years("solanaceae")}年あけるのが目安とされています。青枯病や半身萎凋病といった土壌病害が残りやすく、家庭菜園で最も連作に注意したいグループです。`,
  },
  {
    q: "ウリ科・アブラナ科・マメ科はどのくらいあけますか？",
    a: `キュウリ・カボチャなどのウリ科は${years("cucurbitaceae")}年、キャベツ・ダイコンなどのアブラナ科は${years("brassicaceae")}年、エダマメ・インゲンなどのマメ科は${years("fabaceae")}年が目安です。マメ科は根粒菌で土を豊かにする一方、ネコブセンチュウが増えやすいため、年数をあけない扱いにはできません。`,
  },
  {
    q: "連作障害が出にくい野菜はありますか？",
    a: `${familiesInTier("none").join("・")}はあいだをあけずに続けやすいグループで、サツマイモやトウモロコシが代表です。前の作で荒れた区画をはさむ「休ませ役」としても使えます。${familiesInTier("light").join("・")}も比較的連作に強く、1年あければ十分とされています。連作に強い＝無制限ではないので、土づくりは通常どおり必要です。`,
  },
  {
    q: "プランターやベランダでも連作障害は起きますか？",
    a: "起きます。土の量が少ないぶん養分の偏りや病原菌の密度が上がりやすく、畑よりも影響が出やすいことすらあります。プランターの場合は土を入れ替える・再生資材で作り直すという対処が取れるので、畑よりも回復させやすいのが違いです。畑めぐりでは畝とプランターを同じ区画として並べて管理できます。",
  },
  {
    q: "輪作の順番はどう決めればよいですか？",
    a: "同じ科が続かないように並べるのが第一で、そのうえで「深く根を張る科」と「浅い科」、「養分を多く使う科」と「土を休ませる科」を交互にすると土の負担が散ります。区画数が少ないうちは、まず連作を避けることだけを守れば十分です。畑めぐりは過去の作付けから同じ科が近すぎないかを色と印で示すので、順番を暗記する必要はありません。",
  },
  {
    q: "コンパニオンプランツを植えれば連作しても大丈夫ですか？",
    a: "いいえ。コンパニオンプランツ（相性の良い組み合わせ）は害虫を寄せつけにくくしたり生育を助けたりしますが、土に残った病原菌やセンチュウを消すものではありません。連作を避けることが主、コンパニオンプランツは補助と考えてください。",
  },
];

/**
 * FAQPage 構造化データ。画面に描画しているのと同じ FAQ 配列から生成する。
 * @param {{ q: string, a: string }[]} faq
 */
export function faqJsonLd(faq = FAQ) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** 画面に出している機能をそのまま列挙する（ここに無い機能を構造化データに書かない）。 */
const FEATURE_LIST = [
  "畝・プランターの区画を並べて作付けを記録",
  "同じ科の連作を色と印で判定",
  "12か月の作付けスケジュール表示",
  "コンパニオンプランツの相性表示",
];

/** WebApplication 構造化データ。無料であることと主題を検索エンジンに示す。 */
export function appJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    inLanguage: "ja",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    description: SITE_DESCRIPTION,
    featureList: FEATURE_LIST,
  };
}
