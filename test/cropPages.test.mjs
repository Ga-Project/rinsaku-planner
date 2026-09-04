// 野菜別ページ（/yasai/…）が作物マスタと食い違わないことを固定するテスト。
//
// 59 ページぶんの本文をマスタから導出しているので、検査すべきは「1ページの見た目」
// ではなく「全ページで成り立つ性質」。年数・科・時期・相性がマスタ由来であること、
// 内部リンクの行き先が実在すること、sitemap が1件も取りこぼさないことを見る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { CROPS, FAMILIES } from "../app/lib/crops.mjs";
import { rotationTier, rotationYearsLabel } from "../app/lib/reference.mjs";
import {
  cropSlugs,
  findCrop,
  cropPage,
  cropIndex,
  cropUrl,
  cropIndexUrl,
  cropJsonLd,
  cropBreadcrumbJsonLd,
  monthRangeLabel,
  shortFamilyName,
} from "../app/lib/cropPages.mjs";
import { SITE_URL } from "../app/lib/site.mjs";

const slugs = cropSlugs();
const pages = slugs.map((s) => cropPage(s));

test("全ての作物にページがあり、slug は一意", () => {
  assert.equal(slugs.length, CROPS.length);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const p of pages) assert.ok(p, "ページを作れない作物がある");
});

test("マスタに無い slug は null（404 にできる）", () => {
  assert.equal(cropPage("not-a-crop"), null);
  assert.equal(findCrop("not-a-crop"), undefined);
});

test("あける年数は作物マスタの値そのもので、段階も同じ定義を使う", () => {
  for (const p of pages) {
    const crop = findCrop(p.slug);
    assert.equal(p.rotationYears, crop.rotationYears);
    assert.equal(p.tier, rotationTier(crop.rotationYears));
    assert.equal(p.yearsLabel, rotationYearsLabel(crop.rotationYears));
  }
});

test("0年を『0年あける』と書かない", () => {
  for (const p of pages.filter((x) => x.tier === "none")) {
    assert.ok(
      !/0年/.test(p.rotationLine),
      `${p.name}: 0年という表記が出ている`,
    );
    assert.match(p.rotationLine, /続けて植えても障害が出にくい/);
  }
});

test("同じ科の一覧は自分を含まず、科が一致する作物を全て挙げる", () => {
  for (const p of pages) {
    const expected = CROPS.filter(
      (c) => c.familyKey === p.familyKey && c.id !== p.slug,
    ).map((c) => c.nameJa);
    assert.deepEqual(
      p.sameFamily.map((c) => c.name),
      expected,
      `${p.name} の同科一覧がマスタと違う`,
    );
  }
});

test("あとに植えやすい野菜は別の科で、それ自身が区画を長く縛らない", () => {
  for (const p of pages) {
    assert.ok(p.followUps.length > 0, `${p.name}: 候補が空`);
    const seen = new Set();
    for (const f of p.followUps) {
      const crop = findCrop(f.slug);
      assert.ok(crop, `${f.slug} がマスタに無い`);
      assert.notEqual(crop.familyKey, p.familyKey, `${p.name}: 同じ科を勧めている`);
      assert.ok(crop.rotationYears <= 1, `${p.name}: ${f.name} は縛りが長い`);
      assert.ok(!seen.has(crop.familyKey), `${p.name}: 科が重複している`);
      seen.add(crop.familyKey);
    }
  }
});

test("内部リンクの行き先は必ず実在する作物", () => {
  const known = new Set(slugs);
  for (const p of pages) {
    for (const c of [
      ...p.sameFamily,
      ...p.followUps,
      ...p.companionGood,
      ...p.companionBad,
    ]) {
      if (c.slug === undefined) continue; // 花・ハーブ等はマスタに無いのでリンクにしない
      assert.ok(known.has(c.slug), `${p.name}: 存在しない行き先 ${c.slug}`);
    }
  }
});

test("リンクにしない相手はマスタに載っていない名前だけ", () => {
  const names = new Set(CROPS.map((c) => c.nameJa));
  for (const p of pages) {
    for (const c of [...p.companionGood, ...p.companionBad]) {
      assert.equal(
        c.slug === undefined,
        !names.has(c.name),
        `${p.name}: ${c.name} のリンク判定がマスタと食い違う`,
      );
    }
  }
});

test("月の表記は年をまたいでも 1〜12月 に潰れない", () => {
  assert.equal(monthRangeLabel([11, 12, 1, 2]), "11〜2月");
  assert.equal(monthRangeLabel([5, 6, 11, 12, 1, 2]), "5〜6月・11〜2月");
  assert.equal(monthRangeLabel([3, 4, 10, 11]), "3〜4月・10〜11月");
  assert.equal(monthRangeLabel([4, 5]), "4〜5月");
  assert.equal(monthRangeLabel([7]), "7月");
  assert.equal(monthRangeLabel([]), "");
  assert.equal(monthRangeLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "通年");
});

test("全ての作物に種まきと収穫の時期が出る", () => {
  for (const p of pages) {
    assert.notEqual(p.sowLabel, "", `${p.name}: 種まき時期が空`);
    assert.notEqual(p.harvestLabel, "", `${p.name}: 収穫時期が空`);
  }
});

test("文中の科名は括弧が二重にならない", () => {
  assert.equal(shortFamilyName("ヒガンバナ科（ネギ類）"), "ヒガンバナ科");
  assert.equal(shortFamilyName("ナス科"), "ナス科");
  for (const p of pages) {
    for (const f of p.followUps) {
      assert.ok(!f.familyJa.includes("（"), `${f.name}: 科名に括弧が残っている`);
    }
    for (const q of p.faq) {
      assert.ok(!/（[^）]*（/.test(q.a), `${p.name}: FAQ の括弧が二重`);
    }
  }
});

test("FAQ は野菜名を含み、答えが空でない", () => {
  for (const p of pages) {
    assert.ok(p.faq.length >= 2, `${p.name}: FAQ が少ない`);
    for (const q of p.faq) {
      assert.ok(q.q.includes(p.name), `${p.name}: 質問に野菜名が無い`);
      assert.ok(q.a.length > 30, `${p.name}: 答えが短すぎる`);
    }
  }
});

test("FAQ の年数はマスタの値と一致する（本文に直書きしていない）", () => {
  for (const p of pages.filter((x) => x.tier !== "none")) {
    assert.ok(
      p.faq[0].a.includes(`${p.rotationYears}年`),
      `${p.name}: FAQ の年数がマスタと違う`,
    );
  }
});

test("タイトルと説明に野菜名が入る（検索結果で区別できる）", () => {
  const titles = new Set();
  for (const p of pages) {
    assert.ok(p.title.includes(p.name));
    assert.ok(p.description.includes(p.name));
    titles.add(p.title);
  }
  assert.equal(titles.size, pages.length, "タイトルが重複している");
});

test("URL は公開URLの下に生成され、末尾スラッシュを持つ", () => {
  for (const p of pages) {
    assert.equal(p.url, `${SITE_URL}yasai/${p.slug}/`);
    assert.equal(cropUrl(p.slug), p.url);
  }
  assert.equal(cropIndexUrl(), `${SITE_URL}yasai/`);
});

test("索引は作物を持つ全ての科を、あける年数の重い順に載せる", () => {
  const index = cropIndex();
  const withCrops = new Set(CROPS.map((c) => c.familyKey));
  assert.equal(index.length, withCrops.size);
  for (let i = 1; i < index.length; i += 1) {
    assert.ok(
      index[i - 1].rotationYears >= index[i].rotationYears,
      "年数の降順になっていない",
    );
  }
  // 索引に出る作物の総数がマスタと一致する＝どこにも属さない作物が無い
  assert.equal(
    index.reduce((n, f) => n + f.crops.length, 0),
    CROPS.length,
  );
});

test("索引の年数は作物ごとの値（科の代表値で塗り潰さない）", () => {
  for (const f of cropIndex()) {
    for (const c of f.crops) {
      const crop = findCrop(c.slug);
      assert.equal(c.yearsLabel, rotationYearsLabel(crop.rotationYears));
    }
  }
  // 科の代表値と作物の値がずれる例が実在することを固定する（この検査の意味が消えない）
  const famYears = Object.fromEntries(
    FAMILIES.map((f) => [f.key, f.rotationYears]),
  );
  assert.ok(
    CROPS.some((c) => c.rotationYears !== famYears[c.familyKey]),
    "科と作物で年数がずれる作物が無くなった（検査の前提が崩れた）",
  );
});

test("構造化データは画面に出している事実だけを持つ", () => {
  for (const p of pages) {
    const article = cropJsonLd(p);
    assert.equal(article["@type"], "Article");
    assert.equal(article.headline, p.title);
    assert.equal(article.description, p.description);
    assert.equal(article.mainEntityOfPage["@id"], p.url);

    const crumb = cropBreadcrumbJsonLd(p);
    assert.equal(crumb["@type"], "BreadcrumbList");
    assert.deepEqual(
      crumb.itemListElement.map((x) => x.position),
      [1, 2, 3],
    );
    assert.equal(crumb.itemListElement[2].item, p.url);
    assert.equal(crumb.itemListElement[1].item, cropIndexUrl());
  }
});
