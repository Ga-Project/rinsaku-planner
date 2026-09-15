// 畑めぐり（rinsaku-planner）— 区画パネルの view-model。
// 判定そのものは rotation.mjs / suggest.mjs が行い、ここはその結果を集めて
// 「画面に出る文」を組み立てる。判定文の文面はこのファイルだけが持つ。
//
// ■ なぜ判定エンジンから文を分けるか
//   文に必要な「作物名」と「暦の今日」を evaluateRotation() は構造上持てない
//   （純粋関数として暦も作物マスタも参照しない）。持てないものを文にさせていたのが
//   次の2つの欠陥の共通の原因だった。
//     1. 目安年数に主語が無い  … 判定は作物ごとの年数を使うが早見表は科の代表値を
//        出すため、59作物中20作物で数字が食い違い、同じパネルに根拠なく並ぶ。
//     2. 過ぎた年に将来の助言  … 判定年より後の作付けと衝突しても ng になるので、
//        去年の記録を入れただけの人に「早くて2031年です」と実行できない助言が出る。
//   エンジンは事実だけを返し、暦と作物名を知っているこの層が文にする。
//
// ■ 3つの面が必ずこの関数を通ること
//   区画バナー・候補チップ・追加フォームのプレビューは、同じパネルに上下で並ぶ。
//   面ごとに文を書くと食い違うので、面の差は「同じ科の記録が無いときの文」と
//   「どこを見てほしいか（hereLabel）」の2つだけを引数で渡す形に閉じてある。

import { bedStatus, evaluateRotation } from "./rotation.mjs";
import { MAX_YEAR } from "./storage.mjs";
import { suggestPlantings, groupSuggestions } from "./suggest.mjs";

/**
 * @typedef {import("./types").RotationStatus} RotationStatus
 * @typedef {import("./types").ConflictSide} ConflictSide
 * @typedef {import("./types").PanelChip} PanelChip
 * @typedef {import("./types").PanelGroups} PanelGroups
 */

/**
 * @typedef {Object} VerdictFacts エンジンが返す事実（文は含まない）。
 * @property {RotationStatus} status
 * @property {number} requiredYears
 * @property {number | null} nearestSameFamilyYear
 * @property {number | null} gapYears
 * @property {number | null} nextPlantableYear
 * @property {ConflictSide} conflictSide
 */

/**
 * 面ごとの差分。ここに無い違いを増やさないこと（増やすと面ごとに文がずれる）。
 * @type {Record<"bed" | "chip" | "preview", {empty: string, here: string}>}
 */
const FACES = {
  // 区画バナー。同科が判定対象の1件だけのときは専用の文を出すので、
  // 「記録なし」の文はこの面では使わない（区画全体についての全称否定になるため）。
  bed: {
    empty: null,
    here: "下の「いま植えるなら」",
  },
  // 候補チップ。判定年は必ず今年か翌年なので、過ぎた年の分岐は起きない
  //（＝ng では here に到達しない。here は将来 ok/caution 側で使う余地のみ）。
  chip: {
    empty: "この区画に、同じ科の作付けの記録はありません。",
    here: "「いま植えるなら」",
  },
  // 追加フォームのプレビュー。まだ記録していないので「ほかに」は事実に反する。
  preview: {
    empty: "この区画に、同じ科の作付けの記録はありません。",
    here: "上の「いま植えるなら」",
  },
};

/**
 * 連作判定の説明文を組み立てる。
 *
 * 文 = 〔1 何と近いか〕＋〔2 目安との照合〕＋〔3 締め〕。
 * 年数は必ず `{作物名}の目安{n}年` の形でしか出さない（欠陥1）。
 * 締めは「これから動かせる年があるか」で分岐し、動かせる年が無ければ
 * 助言を出さずに次に動かせる場所へ送る（欠陥2）。
 *
 * @param {VerdictFacts} facts エンジンが返した事実
 * @param {Object} ctx
 * @param {string} ctx.cropName 判定に使った作物の和名（目安年数の主語）
 * @param {number} ctx.judgedYear 判定した年
 * @param {number} ctx.currentYear 暦の今年（過ぎた年かどうかの判定にだけ使う）
 * @param {"bed" | "chip" | "preview"} ctx.face どの面に出すか
 * @param {number} [ctx.sameFamilyCount] 区画の同じ科の作付け件数（bed 面でのみ使う）
 * @returns {string}
 */
export function rotationSentence(facts, ctx) {
  const face = FACES[ctx.face];
  const req = facts.requiredYears;

  // 目安0年の科は「何年あける」という枠組み自体が当てはまらない。
  // 早見表の0年ラベル「続けて植えやすい」と語を揃える。
  if (req <= 0) {
    return `${ctx.cropName}は、間隔をあけずに続けて植えやすい野菜です。`;
  }

  // ■ バナーは判定対象の作付けを必ず基準点として名乗る
  //   バナーだけが判定対象自身を履歴から外して数えるので、区画全体について
  //   全称的に語ると、同じ記録を数に入れる候補チップと真っ向から食い違う。
  //   （実測: 全称否定「ほかにありません」と、同じ記録を名指しするチップの同居が
  //    11,800パネル。基準点を名乗らない「間隔は◯年」の衝突が232パネル。）
  if (ctx.face === "bed" && ctx.sameFamilyCount === 1) {
    return `この区画に記録した同じ科の作付けは、この${ctx.judgedYear}年の${ctx.cropName}1件だけです。この作付けは連作になっていません。`;
  }

  const near = facts.nearestSameFamilyYear;
  if (near === null || facts.gapYears === null || facts.conflictSide === null) {
    // bed 面はここに来ない（同科は必ず判定対象自身を含む）。来たら実装の誤り。
    return face.empty ?? "";
  }

  const gap = facts.gapYears;
  const side = facts.conflictSide;

  // 〔1〕何と近いか。年の入力は過去も未来も受けるので、ここでは時制語を使わない
  //      （「予定」「済み」は判定年より後の記録に対して嘘になる）。時制は〔3〕だけが扱う。
  // 「もう1件」は件数の断定で、同じ年に同科が3件ある区画では実数と食い違う
  //（同じパネルの「作付けの記録」で数えて反証できる）。「ほかにも」は1件でも
  // 複数でも真で、「判定対象以外に」という含意も保つ。
  const slot1 =
    side === "same"
      ? `${ctx.judgedYear}年には、同じ科の作付けがほかにもあります。`
      : `${near}年に同じ科の作付けがあります。`;

  // B: バナーで同科が2件以上あるとき、どの作付けから見た間隔なのかを先に名乗る。
  //    同年重複（same）は両面とも間隔0で一致するので前置は要らない。
  const basis =
    ctx.face === "bed" && side !== "same"
      ? `この${ctx.judgedYear}年の${ctx.cropName}から見ると、`
      : "";

  // 〔2〕目安との照合。年数は必ず作物名を主語に付けて名乗る。
  //      caution で数字を1つにするのは、gap === req のとき同じ数を2回書くと
  //      トートロジーになるため（「4年＝その作物の目安」と読めるので検算は成立する）。
  // 同じ年に同じ科がもう1件あるとき「間隔は0年で」と続けるのは、直前の
  // スロット1で言った事実の言い直しになる。畑の文脈で「0年の間隔」とも言わない。
  const gapPhrase = side === "same" ? "間隔があかないので" : `間隔は${gap}年で`;
  const slot2 =
    facts.status === "ok"
      ? `間隔は${gap}年あり、${ctx.cropName}の目安${req}年をこえています。`
      : facts.status === "caution"
        ? `${gapPhrase}、${ctx.cropName}の目安ちょうどです。`
        : `${gapPhrase}、${ctx.cropName}の目安${req}年に足りません。`;

  // 〔3〕締め。ok / caution では出さない。
  //      caution に助言を足すと、衝突相手が判定年より後にあるとき
  //      「もう1年あける」が必ず逆向きになる（間隔が縮んで ng に落ちる）。
  if (facts.status !== "ng") return basis + slot1 + slot2;

  return basis + slot1 + slot2 + closing(facts, ctx, near, req, face.here);
}

/**
 * ng のときの締め。**この画面から利用者がいま引けるレバーのうち、最も安いもの1つ**
 * だけを名指しする。レバーは上から順に:
 *
 *   1. 衝突相手（未来の計画）をずらす … side === "after"。待つより安い
 *   2. 判定年をずらす                 … side === "after" かつ その面で判定年が編集
 *                                        できる（bed / preview）。before/same では
 *                                        「判定年を後ろへずらす」と「置ける年まで
 *                                        待つ」の行き先が同じなので、レバー3の文が
 *                                        そのまま到達点を名指ししている
 *   3. 置ける年まで待つ               … side !== "after" かつ 今年 < next <= MAX_YEAR
 *   0. どれも立たない                 … 助言を出さず、次に答えが出る場所へ送る
 *
 * ⚠️ 「判定年が過ぎているか」はレバー1・2の可否にしか使わない。**レバー3（年の
 * 名指し）のゲートには使わない**。過去の記録を入れた区画でも、待てば植えられる年は
 * 実行できる助言であり、抑制すると「このうねでいつまた植えられるのか」に答えなくなる。
 * 逆にレバー3を side !== "after" でゲートしないと、未来の計画とぶつかっているだけの
 * 区画に「何年も待て」と言う欠陥が戻る。
 *
 * @param {VerdictFacts} facts
 * @param {{judgedYear: number, currentYear: number, face: "bed" | "chip" | "preview"}} ctx
 * @param {number} near 最も近い同科の年
 * @param {number} req あけたい年数
 * @param {string} here 答えが出る場所（面ごと）
 * @returns {string}
 */
function closing(facts, ctx, near, req, here) {
  const judged = ctx.judgedYear;
  const past = judged < ctx.currentYear;

  if (facts.conflictSide === "after") {
    // 名指しした2つの年が両方とも過去。動かせるものがない。
    if (past && near < ctx.currentYear) return noLeverAdvice(here, judged, near);
    // 判定年は動かせないが、衝突年は未来の計画なので動かせる。
    if (past) {
      return `${judged}年はもう過ぎているので、間隔をあけるなら${near}年の作付けをずらすことになります。`;
    }
    // チップの年は暦が決める＝動かせない。かつ判定年の作付けはまだ存在しない。
    // 動かせるのは衝突年の記録だけなので、手の届く場所を名指しする。
    if (ctx.face === "chip") {
      // チップには補助ラベルで「空く年」が出ている。文が「ずらす」しか言わないと、
      // 目で読む人は「待て」、読み上げの人は「ずらせ」と別の助言を受け取る。
      // 2択を同じ順序（安い順）で両方載せて、視覚と読み上げを一致させる。
      const waitPart =
        facts.nextPlantableYear !== null && facts.nextPlantableYear <= MAX_YEAR
          ? `か、${facts.nextPlantableYear}年まで待つ`
          : "";
      return `間隔をあけるには、下の「作付けの記録」で${near}年の作付けをずらす${waitPart}ことになります。`;
    }
    // 判定年も衝突年も編集できる。両端どちらを動かしてもよい。
    return `間隔をあけるには、${judged}年か${near}年のどちらかをずらすことになります。`;
  }

  // side が before / same。待てば実行できるかどうかだけで決まる。
  const next = facts.nextPlantableYear;
  if (next === null) return noLeverAdvice(here, judged, near);
  if (next > MAX_YEAR) {
    // 記録できない年は名指ししない。「{判定年}年より後で」を必ず付ける
    // （付けないと、判定年より前の年で成立しうるので嘘になる）。
    return `${judged}年より後で、どの作付けからも${req}年あく年は、記録できる${MAX_YEAR}年より先になります。`;
  }
  if (next > ctx.currentYear) {
    // 「いまある記録のままだと」を前置するのは、next が未来の計画も含めて
    // 算出されるため。衝突相手が過去でも、別の未来の計画が next を押し出している
    // ことがあり、この一句だけが名指しした年を全ての配置で真にする。
    // 「{next}年からです」とは書かない。next の後ろが塞がっている配置が実在する。
    return `いまある記録のままだと、どの作付けからも${req}年あくのは早くて${next}年です。`;
  }
  return noLeverAdvice(here, judged, near);
}

/**
 * いま引けるレバーが1つも無いときの締め。助言の代わりに、次に答えが出る場所へ送る。
 *
 * 「そこに一覧があります」型の言い方はしない。誘導先の「いま植えるなら」は適期の
 * 作物が無い月には候補0件になるため、一覧の存在を約束すると嘘になる。場所の指示に
 * 留めれば、答えが「いまは無い」でも文は成立する。
 * （PlantNow は候補0件でも見出しと不在メッセージを必ず描く。そこを「0件なら非表示」に
 *   変えるとこの文が宙に浮くので、変えるならこの文も同時に変える。）
 *
 * @param {string} here
 */
function noLeverAdvice(here, judged, near) {
  // 「どちらも」と言うなら、その2つが文の中に無いと読み手が確定できない。
  // 判定年は小見出しや入力欄まで視線を戻さないと分からない位置にある。
  const subject =
    judged === near
      ? `${judged}年のことはもう過ぎている`
      : `${judged}年も${near}年ももう過ぎている`;
  return `${subject}ので、これから植えるものは${here}で確かめてください。`;
}

/**
 * 候補チップに出す短い補助ラベル（無ければ null）。
 *
 * ■ 軸を1本に揃える
 *   利用者はチップに並んだ年の数字だけを見比べる。ここに「空く年」と「ふさいでいる年」を
 *   混ぜると順序が反転して見える。実測では、2025年トマト＋2027年キュウリを記録した区画で
 *   スイカに「2027年と近い」、トマトに「早くて2029年」が並び、**実際は2032年まで置けない
 *   スイカが、2029年のトマトより早く空くように見えた**。相対年数をやめて年にした目的が
 *   「検算できる比較」なので、比較の軸は `nextPlantableYear` の1本に固定する。
 *   なぜふさがっているかは、読み上げ名に載る説明文が担う。
 *
 * 320px でチップが7行に膨らんだ事故があるため全角9以内に収める。
 * 相対年数（「あと5年」）は起点が画面に無く検算できないので使わない。
 *
 * @param {VerdictFacts} facts
 * @returns {string | null}
 */
export function rotationChipNote(facts) {
  if (facts.requiredYears <= 0) return null;
  if (facts.status === "caution") return "目安ちょうど";
  if (facts.status !== "ng") return null;
  // 記録できない年は補助ラベルでも名指ししない（締めの文と同じ規則）。
  if (facts.nextPlantableYear !== null && facts.nextPlantableYear <= MAX_YEAR) {
    return `早くて${facts.nextPlantableYear}年`;
  }
  return null;
}

/**
 * 最新作付けの作物が作物マスタに無いときの、区画バナーの文。
 *
 * 判定欄が黙って消えると「なぜ何も出ないのか」が分からないので、原因の作付けを
 * 年で名指しし、直せる場所まで案内する。
 *
 * @param {number} year 判定できなかった作付けの年
 */
export function unknownCropText(year) {
  // 「登録し直す」操作はその場に無い（記録の行にあるのは削除だけ）。実際に要る
  // 2手をそのまま言う。
  return `${year}年の作付けの作物が一覧にないため、この区画は判定できません。下の「作付けの記録」でその行を削除し、作物をえらび直して追加してください。`;
}

/**
 * 1区画ぶんの「画面に出る文」をすべてここで作る。
 *
 * ■ なぜ3面をまとめて1つの関数にするか
 *   面ごとにコンポーネント側で引数を組み立てていた間、**判定年をどこから採るかを
 *   取り違えても全ゲートが緑のまま通った**（型・lint・テスト・書き出し検査のどれも
 *   `app/components/` を見ていないため）。実際にこの製品は過去に、経路ごとに違う値を
 *   渡す欠陥を全テスト緑のまま公開している。
 *   判定年の決め方（バナー＝最新作付けの年／チップ＝その候補の targetYear／
 *   プレビュー＝入力欄の年）をこの関数の内側に閉じ込めると、取り違えは
 *   コンポーネントからは起こせなくなり、`node --test` だけで固定できる。
 *
 * 呼び出し側（BedEditor / PlantNow）は、返ってきた文をそのまま描くだけにする。
 *
 * @param {Object} input
 * @param {{cropId: string, year: number}[]} input.plantings 区画の作付け
 * @param {number} input.month 暦月（1-12）
 * @param {number} input.currentYear 暦の今年
 * @param {string} input.formCropId 追加フォームで選択中の作物 id（未選択は ""）
 * @param {number | ""} input.formYear 追加フォームの年入力（空欄可）
 * @param {(cropId: string) => (any | undefined)} input.cropLookup
 * @param {any[]} input.crops 作物マスタ
 * @returns {{
 *   banner: {status: RotationStatus, text: string, latestCropId: string, latestYear: number} | null,
 *   unknownCropText: string | null,
 *   groups: PanelGroups,
 *   totalChips: number,
 *   preview: {crop: any, status: RotationStatus, text: string, targetYear: number} | null,
 * }}
 */
export function panelVerdicts(input) {
  const { plantings, month, currentYear, formCropId, formYear, cropLookup, crops } =
    input;

  const bed = bedStatus(plantings, cropLookup);

  // --- 区画バナー: 判定年は「最新作付けの年」。ここ以外から採らない。
  let banner = null;
  if (bed.status !== "empty") {
    const name = bed.latestCropId
      ? (cropLookup(bed.latestCropId)?.nameJa ?? "")
      : "";
    banner = {
      status: bed.status,
      text: rotationSentence(
        { ...bed, status: bed.status },
        {
          cropName: name,
          judgedYear: bed.latestYear ?? currentYear,
          currentYear,
          face: "bed",
          sameFamilyCount: bed.sameFamilyCount,
        },
      ),
      latestCropId: bed.latestCropId ?? "",
      latestYear: bed.latestYear ?? currentYear,
    };
  }

  // --- 候補チップ: 判定年は各候補の targetYear。閲覧年ではない
  //     （12月に見た「翌月」は翌年になる）。
  const suggestions = suggestPlantings(plantings, crops, month, currentYear);
  const grouped = groupSuggestions(suggestions);
  /** @param {any[]} list */
  const decorate = (list) =>
    list.map((s) => ({
      ...s,
      text: rotationSentence(s, {
        cropName: s.nameJa,
        judgedYear: s.targetYear,
        currentYear,
        face: "chip",
      }),
      note: rotationChipNote(s),
    }));

  // --- プレビュー: 判定年は入力欄の年（空欄なら今年）。過去も未来も来る。
  let preview = null;
  const crop = formCropId ? cropLookup(formCropId) : undefined;
  if (crop) {
    const judgedYear = formYear === "" ? currentYear : formYear;
    const records = plantings
      .map((p) => {
        const c = cropLookup(p.cropId);
        return c ? { familyKey: c.familyKey, year: p.year } : null;
      })
      .filter((x) => x !== null);
    const result = evaluateRotation(
      /** @type {any[]} */ (records),
      crop.familyKey,
      crop.rotationYears,
      judgedYear,
    );
    preview = {
      crop,
      status: result.status,
      targetYear: judgedYear,
      text: rotationSentence(result, {
        cropName: crop.nameJa,
        judgedYear,
        currentYear,
        face: "preview",
      }),
    };
  }

  return {
    banner,
    unknownCropText: bed.unknownCrop
      ? unknownCropText(bed.latestYear ?? currentYear)
      : null,
    groups: {
      now: decorate(grouped.now),
      caution: decorate(grouped.caution),
      avoid: decorate(grouped.avoid),
      soon: decorate(grouped.soon),
    },
    totalChips: suggestions.length,
    preview,
  };
}
