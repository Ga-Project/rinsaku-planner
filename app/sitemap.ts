import type { MetadataRoute } from "next";

// output:export では sitemap ルートを静的化する必要がある（未指定だとビルドが落ちる）。
export const dynamic = "force-static";

// static export で out/sitemap.xml を $0 生成する。単一ページ構成なので絶対URL 1件。
// robots.txt は置かない: github.io のサブパス配信ではオリジン直下の robots.txt が
// 権威を持ち、/rinsaku-planner/robots.txt はクローラに読まれないため（no-op を増やさない）。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://ga-project.github.io/rinsaku-planner/",
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
