// プロジェクトページ（<user>.github.io/<repo>/）でのサブパス配信に対応する。
// ルート配信（独自ドメイン・ユーザー/組織ページ）では未設定でよいため、
// basePath は環境変数 BASE_PATH で注入する（未設定なら空＝ルート配信）。
// 例: BASE_PATH=/rinsaku-planner pnpm build
const basePath = process.env.BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // static export（out/ に静的書き出し）。サーバランタイム不要。
  output: "export",
  // export では Next の画像最適化サーバが使えないため無効化（最適化は事前に行うか CSS で対応）。
  images: { unoptimized: true },
  // 各ルートを /path/index.html として出力し、サブディレクトリ配信で 404 を避ける。
  trailingSlash: true,
  // サブパス配信時のみ basePath/assetPrefix を有効化（_next/static の 404 を防ぐ）。
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

export default nextConfig;
