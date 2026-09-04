import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site.mjs";
import { cropSlugs, cropUrl, cropIndexUrl } from "./lib/cropPages.mjs";

// output:export では sitemap ルートを静的化する必要がある（未指定だとビルドが落ちる）。
export const dynamic = "force-static";

// static export で out/sitemap.xml を $0 生成する。URL はすべて lib 側から引く
// （手で書き並べると野菜を1件足すたびに sitemap が置いていかれる）。
// robots.txt は置かない: github.io のサブパス配信ではオリジン直下の robots.txt が
// 権威を持ち、/rinsaku-planner/robots.txt はクローラに読まれないため（no-op を増やさない）。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: cropIndexUrl(), changeFrequency: "monthly", priority: 0.8 },
    ...cropSlugs().map((slug: string) => ({
      url: cropUrl(slug),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
