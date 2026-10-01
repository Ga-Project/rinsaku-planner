// 科別ページ（/yasai/ka/…）が作物マスタとプランナー本体の判定に食い違わないことを固定する。
//
// ■ 何を守るか
//   判定（bedStatus）は「これから植える野菜」の rotationYears を使い、科の代表値は使わない。
//   科ページは科を主語にするので、つい代表値1つで「ナス科は4年」と書きたくなる。
//   そう書くと、3年あけてジャガイモを植えた人にこのページだけが「足りない」と言う。
//   ここでは年数をマスタから独立に数え直し、実際に bedStatus() を呼んで突き合わせる
//   （導出層と同じ式で検算しない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { CROPS, FAMILIES } from "../app/lib/crops.mjs";
import { bedStatus } from "../app/lib/rotation.mjs";
import { rotationTier, rotationYearsLabel } from "../app/lib/reference.mjs";
import { cropSlugs, cropPage, CROP_SECTION } from "../app/lib/cropPages.mjs";
import {
  FAMILY_SECTION,
  familySlugs,
  familyPage,
  hasFamilyPage,
  familyPath,
  familyUrl,
  familyJsonLd,
  familyBreadcrumbJsonLd,
  otherFamilies,
} from "../app/lib/familyPages.mjs";
import { SITE_URL } from "../app/lib/site.mjs";

const lookup = (id) => CROPS.find((c) => c.id === id);
const keys = familySlugs();
const pages = keys.map((k) => familyPage(k));
const BASE_YEAR = 2026;

/** 先に a を植え、gap 年後に b を植えたときの判定。 */
function plantAfter(a, b, gap) {
  return bedStatus(
    [
      { cropId: a, year: BASE_YEAR },
      { cropId: b, year: BASE_YEAR + gap },
    ],
    lookup,
  );
}

/** マスタから独立に数えた、科ごとの所属野菜。 */
function membersCounted(key) {
  const out = [];
  for (const c of CROPS) if (c.familyKey === key) out.push(c);
  return out;
}

test("所属野菜が2種以上の科すべてにページがあり、1種の科には無い", () => {
  for (const f of FAMILIES) {
    const n = membersCounted(f.key).length;
    assert.equal(hasFamilyPage(f.key), n >= 2, `${f.nameJa}（${n}種）`);
  }
  assert.ok(keys.length > 0, "ページを持つ科が1つも無い");
  for (const p of pages) assert.ok(p, "ページを作れない科がある");
});

test("ページの無い科・存在しない key は null（404 にできる）", () => {
  assert.equal(familyPage("not-a-family"), null);
  for (const f of FAMILIES.filter((x) => !hasFamilyPage(x.key))) {
    assert.equal(familyPage(f.key), null, f.nameJa);
  }
});

test("科ページの URL は野菜ページの URL と衝突しない", () => {
  // /yasai/<slug>/ と /yasai/ka/<key>/ は別の段なので、野菜の slug が "ka" だと
  // 野菜ページが科ページの根を奪う。
  assert.ok(!cropSlugs().includes(FAMILY_SECTION));
  for (const k of keys) {
    assert.equal(familyPath(k), `/${CROP_SECTION}/${FAMILY_SECTION}/${k}/`);
    assert.equal(familyUrl(k), `${SITE_URL}${CROP_SECTION}/${FAMILY_SECTION}/${k}/`);
  }
});

test("一覧は所属野菜をもれなく1回ずつ挙げ、年数は野菜ごとのマスタ値", () => {
  for (const p of pages) {
    const expected = membersCounted(p.key);
    assert.equal(p.crops.length, expected.length, p.name);
    assert.equal(p.count, expected.length, p.name);
    assert.deepEqual(
      new Set(p.crops.map((c) => c.slug)),
      new Set(expected.map((c) => c.id)),
      p.name,
    );
    for (const c of p.crops) {
      assert.equal(c.rotationYears, lookup(c.slug).rotationYears, `${p.name}/${c.name}`);
      assert.equal(c.yearsLabel, rotationYearsLabel(c.rotationYears));
    }
    // 長い順（注意の要る野菜が先）
    for (let i = 1; i < p.crops.length; i++) {
      assert.ok(p.crops[i - 1].rotationYears >= p.crops[i].rotationYears, p.name);
    }
  }
});

test("一覧の年数は、その野菜を同じ科のあとに植えるときの判定の必要年数と一致する", () => {
  for (const p of pages) {
    for (const prev of p.crops) {
      for (const next of p.crops) {
        const r = plantAfter(prev.slug, next.slug, 1);
        assert.equal(
          next.rotationYears,
          r.requiredYears,
          `${prev.name} → ${next.name}: ページ ${next.rotationYears} 年 / 判定 ${r.requiredYears} 年`,
        );
      }
    }
  }
});

test("一覧の年数だけあければ ng にならず、1年足りなければ ng になる（どの組み合わせでも）", () => {
  for (const p of pages) {
    for (const prev of p.crops) {
      for (const next of p.crops) {
        if (next.rotationYears === 0) continue;
        assert.notEqual(
          plantAfter(prev.slug, next.slug, next.rotationYears).status,
          "ng",
          `${prev.name} → ${next.name}: ${next.rotationYears} 年あけても ng`,
        );
        assert.equal(
          plantAfter(prev.slug, next.slug, next.rotationYears - 1).status,
          "ng",
          `${prev.name} → ${next.name}: ${next.rotationYears - 1} 年でも ng にならない（年数が過剰）`,
        );
      }
    }
  }
});

test("見出しの年数は科の代表値ではなく、所属野菜の実際の幅", () => {
  for (const p of pages) {
    const ys = membersCounted(p.key).map((c) => c.rotationYears);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    assert.equal(p.minYears, min, p.name);
    assert.equal(p.maxYears, max, p.name);
    const expected =
      max === 0 ? "続けて植えやすい" : min === max ? `${max}年` : min === 0 ? `最長${max}年` : `${min}〜${max}年`;
    assert.equal(p.yearsLabel, expected, p.name);
  }
  // 代表値と幅が食い違う科が実データにあること（この検査が空振りしていない証拠）
  const diverging = pages.filter((p) => {
    const rep = FAMILIES.find((f) => f.key === p.key).rotationYears;
    return p.minYears !== rep || p.maxYears !== rep;
  });
  assert.ok(diverging.length > 0, "代表値と幅が割れる科が無い＝検査が効いていない");
});

test("本文は科の代表値を1つの年数として断定しない", () => {
  for (const p of pages) {
    if (p.minYears === p.maxYears) continue;
    const fam = p.nameInline;
    const texts = [p.rotationLine, p.description, ...p.faq.map((q) => q.a)];
    // 科の代表値も含め、どの1つの数でも言い切らせない（幅の下端・上端・代表値）
    const rep = FAMILIES.find((f) => f.key === p.key).rotationYears;
    for (const t of texts) {
      for (const y of new Set([p.minYears, p.maxYears, rep])) {
        // 「ナス科を最後に作ってから（、）4年あいている」のように、科を主語に1つの年数で言い切る形を禁止
        assert.ok(
          !new RegExp(`${fam}を最後に作ってから、?${y}年`).test(t),
          `${p.name}: 年数が割れる科なのに ${y} 年で言い切っている`,
        );
      }
    }
    // 言い切らないだけでなく、幅（または上限と続けて植えやすい野菜）を実際に言っている
    if (p.minYears > 0) {
      assert.ok(p.rotationLine.includes(`${p.minYears}〜${p.maxYears}年`), `${p.name}: 幅を書いていない`);
    } else {
      assert.ok(p.rotationLine.includes(`${p.maxYears}年`), `${p.name}: 上限を書いていない`);
      assert.ok(p.rotationLine.includes("続けて植えやすい"), `${p.name}: 0年の野菜に触れていない`);
    }
  }
});

test("年数の決まり方の実例は、実際の判定と同じ向き", () => {
  for (const p of pages) {
    if (p.minYears === p.maxYears) {
      assert.equal(p.directionNote, "", `${p.name}: 割れない科に実例を出している`);
      continue;
    }
    const long = p.crops.find((c) => c.rotationYears === p.maxYears);
    const short = p.crops.find((c) => c.rotationYears === p.minYears);
    // 長い野菜のあとに短い野菜を植える: 必要なのは短い側の年数
    assert.equal(plantAfter(long.slug, short.slug, 1).requiredYears, p.minYears);
    // 短い野菜のあとに長い野菜を植える: 必要なのは長い側の年数
    assert.equal(plantAfter(short.slug, long.slug, 1).requiredYears, p.maxYears);
    assert.ok(p.directionNote.includes(long.name) && p.directionNote.includes(short.name), p.name);
    assert.ok(p.directionNote.includes(`${long.name}の${p.maxYears}年`), p.name);
    if (p.minYears > 0) {
      assert.ok(p.directionNote.includes(`${short.name}の${p.minYears}年`), p.name);
    } else {
      assert.ok(p.directionNote.includes(`${short.name}なら続けて植えやすく`), p.name);
    }
  }
});

test("0年を『0年』と書かない", () => {
  for (const p of pages) {
    const texts = [p.rotationLine, p.description, p.directionNote, p.yearsLabel, ...p.faq.map((q) => q.a)];
    for (const t of texts) assert.ok(!/(^|[^\d])0年/.test(t), `${p.name}: 0年という表記`);
  }
});

test("あとに植えやすい野菜は別の科で、翌年に植えても連作にあたらない", () => {
  for (const p of pages) {
    assert.ok(p.followUps.length > 0, p.name);
    for (const f of p.followUps) {
      assert.notEqual(lookup(f.slug).familyKey, p.key, `${p.name}: 同じ科の ${f.name}`);
      for (const prev of p.crops) {
        assert.equal(plantAfter(prev.slug, f.slug, 1).status, "ok", `${prev.name} → ${f.name}`);
      }
    }
  }
});

test("野菜ページと科ページで「あとに植えやすい野菜」の並びが同じ", () => {
  for (const p of pages) {
    for (const c of p.crops) {
      assert.deepEqual(
        cropPage(c.slug).followUps.map((x) => x.slug),
        p.followUps.map((x) => x.slug),
        `${c.name} と ${p.name}`,
      );
    }
  }
});

test("括弧の二重・空の列挙を出さない", () => {
  for (const p of pages) {
    const texts = [p.title, p.description, p.rotationLine, p.directionNote, p.headingCrops, p.headingFollowUps, p.headingFaq, ...p.faq.flatMap((q) => [q.q, q.a])];
    for (const t of texts) {
      assert.ok(!/（[^）]*（/.test(t), `${p.name}: 括弧が二重 ${t}`);
      assert.ok(!/（）|・・|、、|などなど/.test(t), `${p.name}: 空の列挙 ${t}`);
    }
  }
});

test("FAQ はページ固有で、構造化データは画面と同じ事実だけを持つ", () => {
  const qs = pages.flatMap((p) => p.faq.map((q) => q.q));
  assert.equal(new Set(qs).size, qs.length, "FAQ の質問が科をまたいで重複");
  for (const p of pages) {
    const ld = familyJsonLd(p);
    assert.equal(ld.headline, p.title);
    assert.equal(ld.description, p.description);
    assert.equal(ld.mainEntityOfPage["@id"], p.url);
    const bc = familyBreadcrumbJsonLd(p);
    assert.equal(bc.itemListElement.at(-1).item, p.url);
    assert.equal(bc.itemListElement.at(-1).name, p.name);
  }
});

test("ほかの科への導線は自分を含まず、ページのある科だけを指す", () => {
  for (const p of pages) {
    const o = otherFamilies(p.key).map((x) => x.key);
    assert.ok(!o.includes(p.key));
    assert.equal(o.length, keys.length - 1);
    for (const k of o) assert.ok(hasFamilyPage(k));
  }
});

// ---- 独立レビュー（退行注入）で生き残った変更を落とすための検査 ----

test("年数の決まり方の文は、どの句でも『植える側の野菜』とその年数を名指しする", () => {
  // 「Aを作った場所にBを植えるなら（要るのは）Cのn年」を全部拾い、C が B で n が B の年数かを見る。
  // 文面の並びや言い回しではなく、句が主張している事実（誰の何年か）を検算する。
  const re = /([^、。]+?)を作った場所に([^、。]+?)を植えるなら(?:要るのは)?([^、。]+?)の(\d+)年/g;
  let checked = 0;
  for (const p of pages) {
    if (!p.directionNote) continue;
    const found = [...p.directionNote.matchAll(re)];
    assert.ok(found.length > 0, `${p.name}: 年数の句が見つからない`);
    for (const [, prevName, nextName, whoseName, years] of found) {
      const prev = p.crops.find((c) => c.name === prevName);
      const next = p.crops.find((c) => c.name === nextName);
      assert.ok(next, `${p.name}: 植える側「${nextName}」が所属野菜に無い`);
      assert.equal(whoseName, nextName, `${p.name}: 植える側は${nextName}なのに${whoseName}の年数を挙げている`);
      assert.equal(Number(years), next.rotationYears, `${p.name}: ${nextName}の年数`);
      // 作った側が所属野菜に見つからないと判定との照合が黙って飛ぶので、見つかることを先に固定する。
      assert.ok(prev, `${p.name}: 作った側「${prevName}」が所属野菜に無い`);
      assert.equal(plantAfter(prev.slug, next.slug, 1).requiredYears, Number(years), `${p.name}: 判定と不一致`);
      checked++;
    }
  }
  assert.ok(checked >= 5, "検算した句が少なすぎる＝正規表現が空振りしている");
});

test("文中の科名は短縮名（補足の括弧を持つ正式名は見出し・パンくず・h1 だけ）", () => {
  const withNote = pages.filter((p) => p.name !== p.nameInline);
  assert.ok(withNote.length > 0, "補足の括弧を持つ科が無い＝検査が空振りしている");
  for (const p of withNote) {
    const texts = [p.title, p.description, p.rotationLine, p.directionNote, p.headingCrops, p.leadCrops, p.headingFollowUps, p.leadFollowUps, p.headingFaq, ...p.faq.flatMap((q) => [q.q, q.a])];
    for (const t of texts) assert.ok(!t.includes(p.name), `${p.name}: 文中に正式名 ${t}`);
  }
});

test("FAQ の年数の答えは、所属野菜すべての年数を名指しする", () => {
  for (const p of pages) {
    if (p.maxYears === 0) continue;
    const a = p.faq[0].a;
    for (const c of p.crops) {
      assert.ok(a.includes(`${c.name}は${rotationYearsLabel(c.rotationYears)}`), `${p.name}: ${c.name} の年数が答えに無い`);
    }
  }
});

test("見出しの重さは、科で最も長い野菜の年数で決まる", () => {
  for (const p of pages) {
    const max = Math.max(...membersCounted(p.key).map((c) => c.rotationYears));
    assert.equal(p.tier, rotationTier(max), p.name);
  }
});

test("あとに植えやすい野菜は、あき年数の短い順・同点はマスタ順で、FAQ はその先頭から挙げる", () => {
  const order = (slug) => CROPS.findIndex((c) => c.id === slug);
  for (const p of pages) {
    for (let i = 1; i < p.followUps.length; i++) {
      const a = p.followUps[i - 1];
      const b = p.followUps[i];
      assert.ok(
        a.rotationYears < b.rotationYears || (a.rotationYears === b.rotationYears && order(a.slug) < order(b.slug)),
        `${p.name}: ${a.name} と ${b.name} の並び`,
      );
    }
    const listed = p.followUps.slice(0, 4).map((c) => `${c.name}（${c.familyJa}）`).join("・");
    assert.ok(p.faq[1].a.includes(listed), `${p.name}: FAQ の列挙が画面の一覧の先頭と違う`);
  }
});

test("構造化データのパンくずと主題は、画面のパンくずと見出しと同じ", () => {
  for (const p of pages) {
    const items = familyBreadcrumbJsonLd(p).itemListElement;
    assert.deepEqual(
      items.map((x) => [x.name, x.item]),
      [
        ["畑めぐり", SITE_URL],
        ["野菜別 連作ガイド", `${SITE_URL}${CROP_SECTION}/`],
        [p.name, p.url],
      ],
    );
    assert.equal(familyJsonLd(p).about.name, p.name);
  }
});

test("『Aを作った場所でもBなら続けて植えやすく』の B は0年の野菜で、A と同じ科", () => {
  // 句の区切り（、。）ごとに名前を取り出し、所属野菜と完全一致で照合する
  // （「タマネギ」と「ネギ」のような部分一致で通らないように）。
  const re = /(?:^|[、。])([^、。]+?)を作った場所でも([^、。]+?)なら続けて植えやすく/g;
  let checked = 0;
  for (const p of pages) {
    for (const [, prevName, nextName] of p.directionNote.matchAll(re)) {
      const prev = p.crops.find((c) => c.name === prevName);
      const next = p.crops.find((c) => c.name === nextName);
      assert.ok(prev && next, `${p.name}: 「${prevName}」「${nextName}」が所属野菜と完全一致しない`);
      assert.equal(next.rotationYears, 0, `${p.name}: 続けて植えやすいと書いた${nextName}は${next.rotationYears}年`);
      assert.equal(plantAfter(prev.slug, next.slug, 1).status, "ok", `${p.name}: ${prevName}→${nextName} が翌年 ok でない`);
      checked++;
    }
  }
  assert.ok(checked >= 2, "0年の野菜を含む科の句を検算していない＝空振り");
});

test("ページ名は科の正式名（見出し・パンくず・構造化データで使う）", () => {
  for (const p of pages) {
    assert.equal(p.name, FAMILIES.find((f) => f.key === p.key).nameJa);
  }
});
