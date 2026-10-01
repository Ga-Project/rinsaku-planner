// 畑めぐり（rinsaku-planner）— 科ごとの読み物ページのデータ層。
//
// ■ なぜこの層が要るか
//   野菜ページ（/yasai/<id>/）は「トマト 連作 何年」のように野菜の名前で探す人の
//   受け皿。だが連作障害は科の単位で起きるので、「ナス科 連作 何年」「ウリ科 の後に
//   植える野菜」のように科の名前で探す人もいる。その受け皿が無かった。
//   この層は crops.mjs から科1つぶんの読み物を導出し、/yasai/ka/<key>/ として
//   静的HTMLに焼き込めるようにする。
//
// ■ 科の年数を1つの数で断定しない（この層で最も壊しやすいところ）
//   判定（rotation.mjs の bedStatus）が使うのは **これから植える野菜** の rotationYears で、
//   科の代表値（FAMILIES の rotationYears）ではない。ナス科ならトマト4年・ジャガイモ3年と
//   野菜ごとに違う。科ページで「ナス科は4年」と言い切ると、3年あけてジャガイモを
//   植えた人にこのページだけが「足りない」と言うことになる。
//   したがって本文の年数はすべて所属野菜の値から導出し、幅（3〜4年）か野菜ごとの値で
//   書く。科の代表値はこの層では使わない。
//
// ■ ページを作らない科
//   所属野菜が1種しかない科（オクラ・イチゴ・サトイモなど）は、科ページの中身が
//   その野菜のページと同じになる。同じ内容のページを2枚作ると検索の受け皿が割れて
//   どちらも弱くなるので作らない。リンクを張る側は hasFamilyPage() で確かめる。

import { CROPS, FAMILIES } from "./crops.mjs";
import { rotationTier, rotationYearsLabel, SITE_NAME } from "./reference.mjs";
import { SITE_URL } from "./site.mjs";
import {
  CROP_SECTION,
  cropIndexUrl,
  followUpsForFamily,
  shortFamilyName,
} from "./cropPages.mjs";

/** 科ページのURLの根（/yasai/ の下）。ルーティングと sitemap の唯一の出典。 */
export const FAMILY_SECTION = "ka";

/** 科ページを作る最小の所属野菜数（1種の科は野菜ページと同じ内容になる）。 */
const MIN_MEMBERS = 2;

/** 本文の例示に挙げる野菜の数。 */
const EXAMPLE_LIMIT = 3;

/** 科に所属する野菜（マスタ順）。 */
function membersOf(key) {
  return CROPS.filter((c) => c.familyKey === key);
}

/** 科ページを持つ科のキー（FAMILIES の順）。generateStaticParams と sitemap が使う。 */
export function familySlugs() {
  return FAMILIES.filter((f) => membersOf(f.key).length >= MIN_MEMBERS).map(
    (f) => f.key,
  );
}

/** その科にページがあるか（リンクを張る側が使う。無い科へのリンクは 404 になる）。 */
export function hasFamilyPage(key) {
  return familySlugs().includes(key);
}

/** 科ページのサイト内パス（next/link 用。basePath は Next が付ける）。 */
export function familyPath(key) {
  return `/${CROP_SECTION}/${FAMILY_SECTION}/${key}/`;
}

/** 科ページの公開URL（絶対）。canonical と sitemap で使い回す。 */
export function familyUrl(key) {
  return `${SITE_URL}${CROP_SECTION}/${FAMILY_SECTION}/${key}/`;
}

/** 名前を「・」でつなぐ。例示が一部だけなら「など」を付ける。 */
function joinNames(names, total) {
  return `${names.join("・")}${total > names.length ? "など" : ""}`;
}

/**
 * 所属野菜の年数の幅。0 は「年数」ではなく状態（続けて植えやすい）なので、
 * 下端が 0 の科は幅で書かず、上限と「続けて植えやすい野菜」を分けて言う。
 * @param {number} min
 * @param {number} max
 * @returns {"none" | "uniform" | "range" | "fromZero"}
 */
function spreadKind(min, max) {
  if (max === 0) return "none";
  if (min === max) return "uniform";
  if (min === 0) return "fromZero";
  return "range";
}

/**
 * 科1つぶんの読み物。ページ・メタデータ・構造化データはすべてこの戻り値だけを見る
 * （同じ事実が画面と JSON-LD で食い違わないようにするため）。
 * @param {string} key
 */
export function familyPage(key) {
  if (!hasFamilyPage(key)) return null;
  const family = FAMILIES.find((f) => f.key === key);
  if (!family) return null;

  const members = membersOf(key);
  const fam = shortFamilyName(family.nameJa);
  const years = members.map((c) => c.rotationYears);
  const min = Math.min(...years);
  const max = Math.max(...years);
  const kind = spreadKind(min, max);

  // 一覧は「あける年数の長い順・同点はマスタ順」。注意の要る野菜を先に読ませる。
  const crops = members
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.rotationYears - a.c.rotationYears || a.i - b.i)
    .map(({ c }) => ({
      name: c.nameJa,
      slug: c.id,
      rotationYears: c.rotationYears,
      tier: rotationTier(c.rotationYears),
      yearsLabel: rotationYearsLabel(c.rotationYears),
    }));

  // 最長・最短の野菜（マスタ順で先頭）。年数がどちらの野菜で決まるかの実例に使う。
  const longest = crops.filter((c) => c.rotationYears === max);
  const shortest = crops.filter((c) => c.rotationYears === min);
  // 例示には幅の両端（最長・最短）を必ず入れる。マスタ順の先頭だけを挙げると、
  // 「レタス・サニーレタス・シュンギクなど…1〜5年」のように上限を決めている野菜
  // （ゴボウ）が例から消え、例に挙げた野菜に最大の年数が要ると読める。
  const exampleNames = [
    ...new Set([
      longest[0].name,
      shortest[0].name,
      ...members.map((c) => c.nameJa),
    ]),
  ].slice(0, EXAMPLE_LIMIT);
  const examples = joinNames(exampleNames, members.length);
  const zeroNames = shortest.map((c) => c.name).join("・");
  const longestNames = longest.map((c) => c.name).join("・");

  const yearsLabel =
    kind === "none"
      ? "続けて植えやすい"
      : kind === "uniform"
        ? `${max}年`
        : kind === "fromZero"
          ? `最長${max}年`
          : `${min}〜${max}年`;

  const rotationLine =
    kind === "none"
      ? `${fam}の野菜（${examples}）は、同じ場所で${fam}を作った直後でも植えやすいグループです。`
      : kind === "uniform"
        ? `${fam}の野菜（${examples}）を植えるには、その場所で${fam}を最後に作ってから${max}年あいているのが目安です。`
        : kind === "range"
          ? `${fam}の野菜（${examples}）を植えるには、その場所で${fam}を最後に作ってから、植える野菜ごとに${min}〜${max}年あいているのが目安です。`
          : `${fam}の野菜（${examples}）は、植える野菜によって必要なあき年数が違います。その場所で${fam}を最後に作ってから、長いもの${max <= 1 ? "でも" : "では"}${max}年（${longestNames}）あいているのが目安で、${zeroNames}は続けて植えやすい野菜です。`;

  // 年数は「これから植える野菜」の値で決まる、という向きを実例で示す。
  // 野菜ごとに値が割れる科でだけ出す（割れない科では言う必要が無い）。
  const a = longest[0];
  const b = shortest[0];
  const directionNote =
    kind === "range"
      ? `年数は、これから植える野菜のほうで決まります。${a.name}を作った場所に${b.name}を植えるなら要るのは${b.name}の${min}年、${b.name}を作った場所に${a.name}を植えるなら${a.name}の${max}年です。`
      : kind === "fromZero"
        ? `年数は、これから植える野菜のほうで決まります。${a.name}を作った場所でも${b.name}なら続けて植えやすく、${b.name}を作った場所に${a.name}を植えるなら${a.name}の${max}年をみます。`
        : "";

  const followUps = followUpsForFamily(key);

  const description =
    `${rotationLine}` +
    `${fam}の野菜ごとに要るあき年数と、あとに植えやすい野菜をまとめました。登録不要で区画の作付け計画もそのまま作れます。`;

  // 「トマトは4年、ジャガイモは3年、ネギは続けて植えやすい」。0年は状態で言う。
  const listPhrase = crops.map((c) => `${c.name}は${c.yearsLabel}`).join("、");

  const faq = [
    {
      q:
        kind === "none"
          ? `${fam}は連作しても大丈夫ですか？`
          : `${fam}は何年あければよいですか？`,
      a:
        kind === "none"
          ? `${fam}の野菜は連作障害が出にくく、${fam}を作った直後の場所にも植えやすいグループです。ただし土の養分は使われるので、堆肥や元肥での土づくりは通常どおり必要です。`
          : `${rotationLine}連作障害は野菜の名前ではなく科の単位で起きるため、${fam}のどの野菜を作った場所でも、次に植える${fam}の野菜の年数をみます（${listPhrase}）。`,
    },
    {
      q: `${fam}のあとには何を植えればよいですか？`,
      a: `${fam}以外の科を選べば、${fam}の記録は連作にあたりません。${followUps
        .slice(0, 4)
        .map((c) => `${c.name}（${c.familyJa}）`)
        .join(
          "・",
        )}などは、それ自身をまた植えるまでのあき年数も短いので、あいだにはさむ「休ませ役」にしやすい野菜です。`,
    },
    {
      q: `${fam}にはどんな野菜がありますか？`,
      a: `この一覧では${members.map((c) => c.nameJa).join("・")}の${members.length}種を${fam}として扱っています。連作を数えるときは、この${members.length}種のどれを作った記録も同じ${fam}の記録として数えます。`,
    },
  ];

  return {
    key,
    name: family.nameJa,
    // 文中・括弧内に差し込む用の短縮名。見出しや表など単独で置く場所は name を使う。
    nameInline: fam,
    count: members.length,
    minYears: min,
    maxYears: max,
    // 見出しの重さは科で最も長い野菜に合わせる（軽く見せて間違えさせない）。
    tier: rotationTier(max),
    yearsLabel,
    rotationLine,
    directionNote,
    crops,
    followUps,
    headingCrops: `${fam}の野菜と、植えるまでにあけたい年数`,
    leadCrops: `年数は、その野菜を植えるとき、同じ場所で${fam}を最後に作ってから要るあき年数です。野菜の名前から、それぞれの詳しいページへ進めます。`,
    headingFollowUps: `${fam}のあとに植えやすい野菜`,
    leadFollowUps: `${fam}以外の科なら、${fam}の記録は連作にあたりません。なかでも次の野菜は、それ自身をまた植えるまでのあき年数が短いものです。`,
    headingFaq: `${fam}の連作についてよくある質問`,
    title: `${fam}の連作｜野菜ごとにあける年数と、あとに植える野菜`,
    description,
    url: familyUrl(key),
    faq,
  };
}

/**
 * 「ほかの科の連作ガイド」。自分以外で科ページを持つ科を FAMILIES の順で返す。
 * @param {string} key
 */
export function otherFamilies(key) {
  return familySlugs()
    .filter((k) => k !== key)
    .map((k) => ({ key: k, name: FAMILIES.find((f) => f.key === k).nameJa }));
}

/** 科ページの構造化データ。画面に出している事実だけを渡す。 */
export function familyJsonLd(page) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    inLanguage: "ja",
    mainEntityOfPage: { "@type": "WebPage", "@id": page.url },
    about: { "@type": "Thing", name: page.name },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };
}

/** パンくず。索引→科の階層を検索結果にも見せる。 */
export function familyBreadcrumbJsonLd(page) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "野菜別 連作ガイド",
        item: cropIndexUrl(),
      },
      { "@type": "ListItem", position: 3, name: page.name, item: page.url },
    ],
  };
}
