// 畑めぐり（rinsaku-planner）— 野菜ごとの読み物ページのデータ層。
//
// ■ なぜこの層が要るか
//   人が検索するのは「連作障害」ではなく「トマト 連作 何年」「ジャガイモ のあと 何を植える」
//   のように必ず野菜の名前を伴う。しかしトップページは1枚しかないので、その受け皿が
//   どこにも無い。この層は crops.mjs から野菜1件ぶんの読み物を導出し、
//   /yasai/<id>/ として静的HTMLに焼き込めるようにする。
//
// ■ 手で書き写さない
//   年数・科・時期・相性はすべて crops.mjs から引く。文章もテンプレートに値を差し込む
//   形で組み立てるので、マスタを直せば 59 ページぶんの本文が同時に追従する。
//   段階（tier）の境界は reference.mjs の rotationTier() が唯一の定義で、ここでは持たない。
//
// ■ 内部リンク
//   同じ科の野菜・相性の野菜・あとに植えやすい野菜は、マスタに存在するものだけ
//   相互リンクにする（マリーゴールド等の花はマスタに無いのでテキストのまま）。
//   59 ページが互いに繋がることで、1枚もののサイトでは作れない回遊と被リンクができる。

import { CROPS, FAMILIES } from "./crops.mjs";
import { rotationTier, rotationYearsLabel, SITE_NAME } from "./reference.mjs";
import { SITE_URL } from "./site.mjs";

/** 野菜ページのURLの根（末尾スラッシュなし）。ルーティングと sitemap の唯一の出典。 */
export const CROP_SECTION = "yasai";

/** 「あとに植えやすい野菜」に出す最大件数（多いと選べない）。 */
const FOLLOW_UP_LIMIT = 8;

/** 全ページのURL slug（= マスタの id）。generateStaticParams と sitemap が使う。 */
export function cropSlugs() {
  return CROPS.map((c) => c.id);
}

/** slug から作物を引く。存在しなければ undefined（呼び出し側で 404 にする）。 */
export function findCrop(slug) {
  return CROPS.find((c) => c.id === slug);
}

/** 作物の公開URL（絶対）。canonical と sitemap で使い回す。 */
export function cropUrl(slug) {
  return `${SITE_URL}${CROP_SECTION}/${slug}/`;
}

/** 索引ページの公開URL（絶対）。 */
export function cropIndexUrl() {
  return `${SITE_URL}${CROP_SECTION}/`;
}

/**
 * 月の配列を読める範囲表記にする。マスタは昇順とは限らず、年をまたぐ
 * （ハクサイの収穫 = 11,12,1,2）。年末年始をつなげずに min〜max を取ると
 * 「1〜12月」になってしまうため、12→1 を連続とみなす円環として畳む。
 * @param {number[]} months 1–12
 * @returns {string} 例 "4〜5月" / "5〜6月・11〜2月" / "" （空配列のとき）
 */
export function monthRangeLabel(months) {
  const uniq = [...new Set(months)].sort((a, b) => a - b);
  if (uniq.length === 0) return "";
  if (uniq.length === 12) return "通年";

  /** @type {number[][]} */
  const runs = [];
  for (const m of uniq) {
    const last = runs[runs.length - 1];
    if (last && m === last[last.length - 1] + 1) last.push(m);
    else runs.push([m]);
  }
  // 年をまたぐ区間（…12 と 1…）を1本につなぐ。
  if (runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (first[0] === 1 && last[last.length - 1] === 12) {
      runs.pop();
      runs.shift();
      runs.push([...last, ...first]);
    }
  }
  return runs
    .sort((a, b) => a[0] - b[0])
    .map((r) => (r.length === 1 ? `${r[0]}月` : `${r[0]}〜${r[r.length - 1]}月`))
    .join("・");
}

/**
 * 科名を文中に差し込む用に短くする。「ヒガンバナ科（ネギ類）」をそのまま
 * 括弧の中に入れると括弧が二重になって読めなくなるため、補足を落とす。
 * 表・見出しなど単独で置く場所では正式名（nameJa）をそのまま使う。
 * @param {string} nameJa
 */
export function shortFamilyName(nameJa) {
  return nameJa.replace(/（.*?）/g, "");
}

/** マスタに載っている野菜名なら slug を返す（内部リンクにできるかの判定）。 */
function slugOfName(name) {
  return CROPS.find((c) => c.nameJa === name)?.id;
}

/** 野菜名の配列を {name, slug} に変換する。slug が undefined ならリンクにしない。 */
function toLinks(names) {
  return (names ?? []).map((name) => ({ name, slug: slugOfName(name) }));
}

/** 科のメタデータ。マスタに無い科を参照したら黙って既定値にせず落とす。 */
function familyOf(key) {
  const f = FAMILIES.find((x) => x.key === key);
  if (!f) throw new Error(`unknown family: ${key}`);
  return f;
}

/**
 * 「この野菜のあとに植えやすい野菜」。連作は科の単位で起きるので別の科であることが
 * 前提、そのうえでその野菜自身のあける年数が短い（0〜1年）ものを勧める。
 * ここで見るのは科の代表値ではなく作物ごとの rotationYears＝区画が次に縛られる年数で、
 * プランナー本体（rotation.mjs）が必要年数として使う値と同じものを使う。
 * あける年数の小さい順・マスタ順で安定させ、科が偏らないよう1科1件までにする。
 */
function followUps(crop) {
  const seen = new Set();
  return CROPS.map((c, i) => ({ c, i }))
    .filter(({ c }) => c.familyKey !== crop.familyKey && c.rotationYears <= 1)
    .sort((a, b) => a.c.rotationYears - b.c.rotationYears || a.i - b.i)
    .filter(({ c }) => {
      if (seen.has(c.familyKey)) return false;
      seen.add(c.familyKey);
      return true;
    })
    .slice(0, FOLLOW_UP_LIMIT)
    .map(({ c }) => ({
      name: c.nameJa,
      slug: c.id,
      familyJa: shortFamilyName(c.familyJa),
      rotationYears: c.rotationYears,
      yearsLabel: rotationYearsLabel(c.rotationYears),
    }));
}

/**
 * 1件ぶんの読み物。ページ・メタデータ・構造化データはすべてこの戻り値だけを見る
 * （同じ事実が画面と JSON-LD で食い違わないようにするため）。
 * @param {string} slug
 */
export function cropPage(slug) {
  const crop = findCrop(slug);
  if (!crop) return null;

  const family = familyOf(crop.familyKey);
  const tier = rotationTier(crop.rotationYears);
  const yearsLabel = rotationYearsLabel(crop.rotationYears);
  const sameFamily = CROPS.filter(
    (c) => c.familyKey === crop.familyKey && c.id !== crop.id,
  ).map((c) => ({ name: c.nameJa, slug: c.id }));

  const sow = monthRangeLabel(crop.sowMonths);
  const harvest = monthRangeLabel(crop.harvestMonths);
  const good = toLinks(crop.companionGood);
  const bad = toLinks(crop.companionBad);
  const next = followUps(crop);

  // 連作の一文。tier ごとに言い方を変える（0年を「0年あける」と書かない）。
  const rotationLine =
    tier === "none"
      ? `${crop.nameJa}（${crop.familyJa}）は、同じ場所に続けて植えても障害が出にくい野菜です。`
      : `${crop.nameJa}（${crop.familyJa}）は、同じ場所に${crop.familyJa}を再び植えるまで${crop.rotationYears}年あけるのが目安です。`;

  const description =
    `${rotationLine}` +
    `連作になる同じ科の野菜、あとに植えやすい野菜、相性のよい組み合わせ、` +
    `種まきと収穫の時期をまとめました。登録不要で区画の作付け計画もそのまま作れます。`;

  const faq = [
    {
      q:
        tier === "none"
          ? `${crop.nameJa}は連作しても大丈夫ですか？`
          : `${crop.nameJa}は何年あければよいですか？`,
      a:
        tier === "none"
          ? `${crop.nameJa}が属する${crop.familyJa}は連作障害が出にくいグループで、続けて植えやすい野菜です。ただし土の養分は使われるので、堆肥や元肥での土づくりは通常どおり必要です。`
          : `${crop.nameJa}が属する${crop.familyJa}は、同じ場所に再び植えるまで${crop.rotationYears}年あけるのが目安です。連作障害は野菜の名前ではなく科の単位で起きるため、${crop.nameJa}を作った区画では${sameFamily
              .slice(0, 3)
              .map((c) => c.name)
              .join("・")}なども同じ${crop.rotationYears}年のあいだ避けます。`,
    },
    {
      q: `${crop.nameJa}のあとには何を植えればよいですか？`,
      a: `${shortFamilyName(crop.familyJa)}以外の科を選びます。${next
        .slice(0, 4)
        .map((c) => `${c.name}（${c.familyJa}）`)
        .join("・")}のように、それ自身は区画を長く縛らない野菜は、あいだにはさむ「休ませ役」として使いやすい組み合わせです。`,
    },
  ];
  if (good.length > 0) {
    faq.push({
      q: `${crop.nameJa}と相性のよい野菜は何ですか？`,
      a:
        `${crop.nameJa}のそばに植えるとよいとされるのは${good.map((g) => g.name).join("・")}です。` +
        (bad.length > 0
          ? `逆に${bad.map((b) => b.name).join("・")}は近くに植えないほうがよいとされています。`
          : "") +
        `相性のよい組み合わせは害虫を寄せつけにくくしたり生育を助けたりするもので、土に残った病原菌を消すものではありません。連作を避けることが主、組み合わせは補助と考えてください。`,
    });
  }

  return {
    slug: crop.id,
    name: crop.nameJa,
    familyJa: crop.familyJa,
    familyKey: crop.familyKey,
    familyRotationYears: family.rotationYears,
    rotationYears: crop.rotationYears,
    tier,
    yearsLabel,
    note: crop.note,
    sowLabel: sow,
    harvestLabel: harvest,
    sameFamily,
    companionGood: good,
    companionBad: bad,
    followUps: next,
    rotationLine,
    title: `${crop.nameJa}の連作｜あける年数と、あとに植える野菜`,
    description,
    url: cropUrl(crop.id),
    faq,
  };
}

/**
 * 索引。科ごとにまとめ、あける年数の重い順に並べる（早見表と同じ並び）。
 * 年数が同じときはマスタの並び順を保つ＝安定ソート。
 */
export function cropIndex() {
  return FAMILIES.map((f, i) => ({
    key: f.key,
    nameJa: f.nameJa,
    rotationYears: f.rotationYears,
    tier: rotationTier(f.rotationYears),
    yearsLabel: rotationYearsLabel(f.rotationYears),
    crops: CROPS.filter((c) => c.familyKey === f.key).map((c) => ({
      name: c.nameJa,
      slug: c.id,
      rotationYears: c.rotationYears,
      // 作物ごとの年数は科の代表値と一致するとは限らない（ジャガイモ3年 / ナス科4年）。
      // 一覧でも作物の値を出さないと、科の見出しと中身が食い違って見える。
      yearsLabel: rotationYearsLabel(c.rotationYears),
    })),
    _order: i,
  }))
    .filter((f) => f.crops.length > 0)
    .sort((a, b) => b.rotationYears - a.rotationYears || a._order - b._order)
    .map(({ _order, ...rest }) => rest);
}

/** 野菜ページの構造化データ。画面に出している事実だけを渡す。 */
export function cropJsonLd(page) {
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

/** パンくず。索引→野菜の階層を検索結果にも見せる。 */
export function cropBreadcrumbJsonLd(page) {
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
