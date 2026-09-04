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
  CROP_SECTION,
  cropSlugs,
  findCrop,
  cropPage,
  cropIndex,
  cropsByName,
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
    for (const t of [p.rotationLine, p.description, p.leadSameFamily, ...p.faq.map((q) => q.a)]) {
      assert.ok(!/0年/.test(t), `${p.name}: 0年という表記が出ている`);
    }
    assert.match(p.rotationLine, /直後でも植えやすい/);
    assert.equal(p.yearsLabel, "続けて植えやすい");
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

// 「連作にあたらないか」「年数が判定と一致するか」という中身の性質は
// cropPagesRotation.test.mjs が bedStatus() を実際に呼んで検査する。
// ここで見るのは構造（別の科・科が重複しない・実在する）だけに絞る。
test("あとに植えやすい野菜は別の科で、科が重複しない", () => {
  for (const p of pages) {
    assert.ok(p.followUps.length > 0, `${p.name}: 候補が空`);
    const seen = new Set();
    for (const f of p.followUps) {
      const crop = findCrop(f.slug);
      assert.ok(crop, `${f.slug} がマスタに無い`);
      assert.notEqual(crop.familyKey, p.familyKey, `${p.name}: 同じ科を勧めている`);
      assert.ok(!seen.has(crop.familyKey), `${p.name}: 科が重複している`);
      seen.add(crop.familyKey);
    }
  }
});

test("同じ科のチップは各野菜自身の年数を持つ（このページの年数で塗り潰さない）", () => {
  for (const p of pages) {
    for (const c of p.sameFamily) {
      const crop = findCrop(c.slug);
      assert.equal(c.rotationYears, crop.rotationYears, `${p.name}: ${c.name} の年数が違う`);
      assert.equal(c.yearsLabel, rotationYearsLabel(crop.rotationYears));
    }
  }
  // 科の中で年数がばらける作物が実在することを固定する（この検査の意味が消えない）
  assert.ok(
    pages.some((p) => p.sameFamily.some((c) => c.rotationYears !== p.rotationYears)),
    "同じ科で年数がばらける作物が無くなった（検査の前提が崩れた）",
  );
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
    // 画面に出る文字列は全て検査対象にする。description は meta にそのまま出るので
    // ここを外すと検索結果のスニペットだけ壊れる（実際にそうなっていた）。
    const texts = [
      p.rotationLine,
      p.description,
      p.title,
      p.headingSameFamily,
      p.headingFollowUps,
      p.headingCompanions,
      p.headingFaq,
      p.leadSameFamily,
      p.leadFollowUps,
      ...p.faq.map((q) => q.a),
      ...p.faq.map((q) => q.q),
    ];
    for (const t of texts) {
      assert.ok(!/（[^）]*（/.test(t), `${p.name}: 括弧が二重になっている -> ${t.slice(0, 60)}`);
    }
  }
});

test("URL の区画名は yasai で固定（実ルートのディレクトリ名と一致させる）", () => {
  // 値を変えても app/yasai/ のディレクトリ名は追従しないため、
  // canonical と sitemap だけが動いて実ルートが取り残される。
  assert.equal(CROP_SECTION, "yasai");
});

test("FAQ は質問に野菜名を含み、答えがその質問に必要な事実を持つ", () => {
  for (const p of pages) {
    assert.ok(p.faq.length >= 2, `${p.name}: FAQ が少ない`);
    for (const q of p.faq) {
      assert.ok(q.q.includes(p.name), `${p.name}: 質問に野菜名が無い`);
    }
    // 「何年あければ」の答えは科の名前を必ず含む（連作は科の単位で起きるため）
    assert.ok(p.faq[0].a.includes(p.familyInline), `${p.name}: 答えに科の名前が無い`);
    // 「あとに何を植えるか」の答えは、実在する候補の名前を必ず挙げる
    const next = p.faq[1].a;
    assert.ok(
      p.followUps.slice(0, 4).every((f) => next.includes(f.name)),
      `${p.name}: あとに植える候補の名前が答えに入っていない`,
    );
  }
});

test("列挙が空でも文が壊れない（同じ科に自分しかいない作物）", () => {
  // オクラ・イチゴ・サトイモは科に1件しかいない。列挙を無条件に差し込むと
  // 「区画ではなども同じ2年のあいだ避けます」という空の列挙が残る。
  const alone = pages.filter((p) => p.sameFamily.length === 0);
  assert.ok(alone.length > 0, "科に1件だけの作物が無くなった（検査の前提が崩れた）");
  for (const p of pages) {
    const first = p.faq[0].a;
    if (p.sameFamily.length === 0) {
      // 仲間がいないので、名前を並べる言い回しを使ってはいけない
      assert.ok(
        !first.includes("など"),
        `${p.name}: 挙げる相手がいないのに列挙の言い回しが残っている`,
      );
    } else if (p.tier !== "none") {
      // 使うなら必ず実在する仲間の名前が直前に入っていること
      const names = p.sameFamily.slice(0, 3).map((c) => c.name);
      assert.ok(
        first.includes(`${names.join("・")}など`),
        `${p.name}: 列挙の中身が入っていない`,
      );
    }
    // 助詞や読点のあとがそのまま句点になる＝差し込みが空だった痕跡
    for (const text of [p.description, p.rotationLine, ...p.faq.map((q) => q.a)]) {
      assert.ok(!/[、・「]。/.test(text), `${p.name}: 空の差し込みで文が切れている`);
      assert.ok(!/。。|、、|・・/.test(text), `${p.name}: 記号が重複している`);
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

test("栽培メモは年数を持たない（見出しの答えと数字が競合しない）", () => {
  // マスタの note は「連作を避け4年あける。ニラ・ネギ混植で…」のように
  // あける年数と栽培のコツが同居している。年数を落とさずに出すと、
  // 見出し・fact カードと同じ画面に別の年数が並ぶ（ニンニクは 1年 対 3年 で実際に食い違う）。
  for (const p of pages) {
    assert.ok(!/\d+\s*(?:〜\s*\d+)?\s*年/.test(p.note), `${p.name}: 栽培メモに年数が残っている -> ${p.note}`);
    assert.ok(!p.note.includes("。。"), `${p.name}: 栽培メモの句点が壊れている`);
  }
  // 落としたあとも中身が残る野菜が実在する（全部空にしてしまっていない）
  assert.ok(
    pages.filter((p) => p.note.length > 0).length > 20,
    "栽培メモがほとんど空になっている（落としすぎ）",
  );
});

test("索引の科バッジは、そのブロックに並ぶ野菜の実際の範囲を出す", () => {
  for (const f of cropIndex()) {
    const years = f.crops.map((c) => c.rotationYears);
    assert.equal(f.memberMinYears, Math.min(...years), `${f.nameJa}: 下限が違う`);
    assert.equal(f.memberMaxYears, Math.max(...years), `${f.nameJa}: 上限が違う`);
    // 見出しがブロック内の最も長い野菜より軽く見えてはいけない
    for (const c of f.crops) {
      assert.ok(
        c.rotationYears <= f.memberMaxYears,
        `${f.nameJa}: ${c.name} が見出しの上限を超えている`,
      );
    }
  }
  // 代表値と実際の上限がずれる科が実在する（この検査の意味が消えない）
  assert.ok(
    cropIndex().some((f) => f.memberMaxYears > f.rotationYears),
    "科の代表値より重い野菜がいなくなった（検査の前提が崩れた）",
  );
});

test("名前から探す一覧は全作物を読み順で並べる", () => {
  const byName = cropsByName();
  assert.equal(byName.length, CROPS.length);
  assert.deepEqual(
    [...byName].sort((a, b) => a.name.localeCompare(b.name, "ja")).map((c) => c.slug),
    byName.map((c) => c.slug),
    "読み順に並んでいない",
  );
  const known = new Set(cropSlugs());
  for (const c of byName) {
    assert.ok(known.has(c.slug), `存在しない行き先 ${c.slug}`);
    assert.ok(!c.familyJa.includes("（"), `${c.name}: 科名に括弧が残っている`);
  }
});
