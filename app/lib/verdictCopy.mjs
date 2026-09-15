// 畑めぐり（rinsaku-planner）— 連作判定の文面を組み立てる唯一の場所。
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

/**
 * @typedef {import("./types").RotationStatus} RotationStatus
 * @typedef {import("./types").ConflictSide} ConflictSide
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
  // 区画バナー。判定対象の作付け自身が下の一覧に並んでいるので「ほかに」が要る。
  bed: {
    empty: "前後の年に、同じ科の作付けはほかにありません。",
    here: "下の「いま植えるなら」",
  },
  // 候補チップ。判定年は必ず今年か翌年なので、過ぎた年の分岐は起きない。
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

  const near = facts.nearestSameFamilyYear;
  if (near === null || facts.gapYears === null || facts.conflictSide === null) {
    return face.empty;
  }

  const gap = facts.gapYears;
  const side = facts.conflictSide;

  // 〔1〕何と近いか。年の入力は過去も未来も受けるので、ここでは時制語を使わない
  //      （「予定」「済み」は判定年より後の記録に対して嘘になる）。時制は〔3〕だけが扱う。
  const slot1 =
    side === "same"
      ? `${ctx.judgedYear}年には、同じ科の作付けがもう1件あります。`
      : `${near}年に同じ科の作付けがあります。`;

  // 〔2〕目安との照合。年数は必ず作物名を主語に付けて名乗る。
  //      caution で数字を1つにするのは、gap === req のとき同じ数を2回書くと
  //      トートロジーになるため（「4年＝その作物の目安」と読めるので検算は成立する）。
  const slot2 =
    facts.status === "ok"
      ? `間隔は${gap}年あり、${ctx.cropName}の目安${req}年をこえています。`
      : facts.status === "caution"
        ? `間隔は${gap}年で、${ctx.cropName}の目安ちょうどです。`
        : `間隔は${gap}年で、${ctx.cropName}の目安${req}年に足りません。`;

  // 〔3〕締め。ok / caution では出さない。
  //      caution に助言を足すと、衝突相手が判定年より後にあるとき
  //      「もう1年あける」が必ず逆向きになる（間隔が縮んで ng に落ちる）。
  if (facts.status !== "ng") return slot1 + slot2;

  const past = ctx.judgedYear < ctx.currentYear;

  if (side === "after") {
    // 衝突相手が判定年より後。この作付けを先送りしても相手に近づくだけなので
    // 「早くて◯年」は出さない（出すと実行意図と食い違う＝欠陥2の実測ケース）。
    if (!past) {
      return (
        slot1 +
        slot2 +
        `間隔をあけるには、${ctx.judgedYear}年か${near}年のどちらかをずらすことになります。`
      );
    }
    if (near >= ctx.currentYear) {
      return (
        slot1 +
        slot2 +
        `${ctx.judgedYear}年はもう過ぎているので、間隔をあけるなら${near}年の作付けをずらすことになります。`
      );
    }
    // 判定年も衝突年も過去。動かせる年が無い。
    return slot1 + slot2 + pastAdvice(face.here);
  }

  // side が before / same。判定年を先送りできるなら、置ける年を名指しできる。
  if (!past && facts.nextPlantableYear !== null) {
    return (
      slot1 +
      slot2 +
      `どの作付けからも${req}年あくのは、早くて${facts.nextPlantableYear}年です。`
    );
  }
  return slot1 + slot2 + pastAdvice(face.here);
}

/**
 * 動かせる年が無いときの締め。助言の代わりに、次に動かせる場所へ送る。
 * @param {string} here
 */
function pastAdvice(here) {
  return `過ぎた年の記録なので、これから植えるものは${here}で確かめてください。`;
}

/**
 * 候補チップに出す短い補助ラベル（無ければ null）。
 *
 * 320px でチップが7行に膨らんだ事故があるため全角9以内に収める。
 * 相対年数（「あと5年」）は起点が画面に無く検算できないので使わない。
 * 衝突相手が判定年より後のときに「早くて◯年」を出さないのは、その年が
 * 未来の計画より後ろの年になり、チップ同士を「どれが先に空くか」で
 * 見比べる用途に対して嘘になるため。比較の軸を相手の年に切り替える。
 *
 * @param {VerdictFacts} facts
 * @returns {string | null}
 */
export function rotationChipNote(facts) {
  if (facts.requiredYears <= 0) return null;
  if (facts.status === "caution") return "目安ちょうど";
  if (facts.status !== "ng") return null;
  if (facts.conflictSide === "same") return "同じ年に重なる";
  if (facts.conflictSide === "after" && facts.nearestSameFamilyYear !== null) {
    return `${facts.nearestSameFamilyYear}年と近い`;
  }
  if (facts.nextPlantableYear !== null) {
    return `早くて${facts.nextPlantableYear}年`;
  }
  return null;
}

/**
 * 区画バナーに出す文。bedStatus の結果から、作物名と判定年の取り出しまでを含めて
 * ここで完結させる。
 *
 * この組み立てをコンポーネント側に置くと、どの引数を渡したかを検査する手段が
 * JSX を描画することしか無くなる。実際に一度、経路ごとに違う値を渡していた欠陥が
 * 全テスト緑のまま公開まで通っている（区画バナーだけが「2026年 トマト」と表示した
 * 直下で「2026年までに記録はありません」と言う状態）。
 *
 * @param {import("./types").BedRotation} bed bedStatus の結果
 * @param {(cropId: string) => ({nameJa?: string} | undefined)} cropLookup
 * @param {number} currentYear 暦の今年
 * @returns {string | null} 判定を出さない区画（作付けなし・判定不能）は null
 */
export function bedVerdictText(bed, cropLookup, currentYear) {
  if (bed.status === "empty") return null;
  const name = bed.latestCropId
    ? (cropLookup(bed.latestCropId)?.nameJa ?? "")
    : "";
  return rotationSentence(
    { ...bed, status: bed.status },
    {
      cropName: name,
      // 区画の判定は「最新の作付け」に対して行うので、その年が判定年。
      judgedYear: bed.latestYear ?? currentYear,
      currentYear,
      face: "bed",
    },
  );
}

/**
 * 候補チップに出す文。候補は「これから植える場合」なので判定年は targetYear。
 * （閲覧年ではない。12月に見た「翌月」は翌年になる。）
 *
 * @param {import("./types").Suggestion} suggestion
 * @param {number} currentYear 暦の今年
 * @returns {string}
 */
export function suggestionText(suggestion, currentYear) {
  return rotationSentence(suggestion, {
    cropName: suggestion.nameJa,
    judgedYear: suggestion.targetYear,
    currentYear,
    face: "chip",
  });
}

/**
 * 追加フォームのプレビューに出す文。判定年は入力欄の年で、過去も未来も来る。
 *
 * @param {import("./types").RotationResult} result
 * @param {{nameJa: string}} crop 選択中の作物
 * @param {number} judgedYear 入力欄の年
 * @param {number} currentYear 暦の今年
 * @returns {string}
 */
export function previewVerdictText(result, crop, judgedYear, currentYear) {
  return rotationSentence(result, {
    cropName: crop.nameJa,
    judgedYear,
    currentYear,
    face: "preview",
  });
}

/** 最新作付けの作物が作物マスタに無いときの、区画バナーの文。 */
export const UNKNOWN_CROP_TEXT =
  "この作付けの作物が見つからないため、判定できません。";
