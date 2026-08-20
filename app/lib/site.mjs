// 公開URLの単一情報源。
//
// 配信形態は next.config.mjs と同じ BASE_PATH から導く:
//   BASE_PATH=/rinsaku-planner  → https://<ORIGIN>/rinsaku-planner/  （プロジェクトページ）
//   BASE_PATH 未設定            → https://<ORIGIN>/                  （ルート配信）
// 別ドメインへ移すときに触るのは ORIGIN と CI の BASE_PATH だけで、
// canonical・og:url・sitemap は自動で追従する。

/** 配信オリジン（スキーム + ホスト。末尾スラッシュを含めない）。 */
const ORIGIN = "https://ga-project.github.io";

/** next.config.mjs と同じ規約で basePath を読む（未設定なら空＝ルート配信）。 */
const BASE_PATH = process.env.BASE_PATH ?? "";

/**
 * 公開URL（末尾スラッシュ付きの絶対URL）。
 * metadataBase に渡すため、末尾スラッシュは必ず1つに正規化する
 * （落ちると og.png が /og.png に解決されて 404 になる）。
 */
export const SITE_URL = `${ORIGIN}/${BASE_PATH.replace(/^\/+|\/+$/g, "")}${
  BASE_PATH.replace(/^\/+|\/+$/g, "") ? "/" : ""
}`;
