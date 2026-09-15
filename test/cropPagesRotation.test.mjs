// 読み物ページの助言が、プランナー本体の判定（rotation.mjs）と一致することを固定する。
//
// ■ なぜ別ファイルか
//   cropPages.test.mjs は「導出層が作物マスタと食い違わないこと」を見る。
//   だがマスタと一致していても、年数の**向き**を取り違えれば助言は誤りになる。
//   rotationYears は「その野菜を植えるとき、同じ科を最後に作ってから要るあき年数」で、
//   「その野菜を植えたら区画がふさがる年数」ではない。この2つは20作物で値が食い違う。
//   ここでは実際に bedStatus() を呼び、ページが書いた年数どおりに植えたときの判定を見る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { CROPS } from "../app/lib/crops.mjs";
import { bedStatus } from "../app/lib/rotation.mjs";
import { cropSlugs, cropPage } from "../app/lib/cropPages.mjs";

const lookup = (id) => CROPS.find((c) => c.id === id);
const pages = cropSlugs().map((s) => cropPage(s));
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

test("同じ科の各野菜に出している年数は、その野菜を植えるときの必要年数と一致する", () => {
  for (const p of pages) {
    for (const c of p.sameFamily) {
      const judged = plantAfter(p.slug, c.slug, 1).requiredYears;
      assert.equal(
        c.rotationYears,
        judged,
        `${p.name} → ${c.name}: ページは ${c.rotationYears} 年と出しているが、判定の必要年数は ${judged} 年`,
      );
    }
  }
});

test("同じ科の野菜を、ページが出した年数だけあけて植えると ng にならない", () => {
  for (const p of pages) {
    for (const c of p.sameFamily) {
      const r = plantAfter(p.slug, c.slug, c.rotationYears);
      assert.notEqual(
        r.status,
        "ng",
        `${p.name} → ${c.name}: ${c.rotationYears} 年あけても ${r.status}（間隔${r.gapYears}年 / 目安${r.requiredYears}年）`,
      );
      // 1年足りなければ必ず ng になる＝出している年数が過剰でもない
      if (c.rotationYears > 0) {
        assert.equal(
          plantAfter(p.slug, c.slug, c.rotationYears - 1).status,
          "ng",
          `${p.name} → ${c.name}: ${c.rotationYears - 1} 年でも ng にならない（年数が過剰）`,
        );
      }
    }
  }
});

test("この野菜自身の年数は、同じ科のあとに自分を植えるときの必要年数", () => {
  for (const p of pages) {
    // 同じ科の誰かのあとに自分を植える（仲間がいない科は自分の直後で見る）
    const prev = p.sameFamily[0]?.slug ?? p.slug;
    const judged = plantAfter(prev, p.slug, 1).requiredYears;
    assert.equal(
      p.rotationYears,
      judged,
      `${p.name}: ページの年数 ${p.rotationYears} と判定の必要年数 ${judged} が違う`,
    );
  }
});

test("「あとに植えやすい野菜」は翌年に植えても連作にあたらない", () => {
  for (const p of pages) {
    for (const f of p.followUps) {
      const r = plantAfter(p.slug, f.slug, 1);
      assert.equal(
        r.status,
        "ok",
        `${p.name} → ${f.name}: 翌年に植えて ${r.status}（間隔${r.gapYears}年 / 目安${r.requiredYears}年）`,
      );
    }
  }
});

test("「あとに植えやすい野菜」に出している年数は、その野菜をまた植えるときの必要年数", () => {
  for (const p of pages) {
    for (const f of p.followUps) {
      const judged = plantAfter(f.slug, f.slug, 1).requiredYears;
      assert.equal(
        f.rotationYears,
        judged,
        `${p.name} の候補 ${f.name}: ページは ${f.rotationYears} 年、判定は ${judged} 年`,
      );
    }
  }
});

test("本文が『区画がふさがる年数』として年数を書いていない", () => {
  // 誤った向きの言い回しを名指しで禁止する。導入文・説明文・リード・FAQ が対象。
  const banned = [/区画を(長く)?縛/, /区画が.*ふさが/, /のあいだ避けます/, /区画は.*年.*使えま/];
  for (const p of pages) {
    const texts = [
      p.rotationLine,
      p.description,
      p.leadSameFamily,
      p.leadFollowUps,
      ...p.faq.map((q) => q.a),
    ];
    for (const t of texts) {
      for (const re of banned) {
        assert.ok(!re.test(t), `${p.name}: 年数を区画の拘束として書いている（${re}）`);
      }
    }
  }
});
