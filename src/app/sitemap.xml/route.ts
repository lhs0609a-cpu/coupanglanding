import { NextResponse } from "next/server";
import { getKeywordCount } from "@/lib/data/seo-keywords";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 사이트맵 인덱스 → /sitemap.xml
 *
 * 검색엔진에는 **이 주소 하나만** 제출하면 된다. 나머지 사이트맵은 여기서 따라 들어간다.
 * 예전에는 /sitemap.xml 이 핵심 페이지 26개짜리라, 그것만 제출하면 카테고리 11,657개와
 * 키워드 69,522개가 통째로 빠졌다.
 *
 * 자식 사이트맵
 *   /pages-sitemap.xml                핵심 페이지 + 가이드 (26개)
 *   /coupang/category/sitemap.xml     쿠팡 카테고리 문서 (11,658개)
 *   /coupang/keyword/sitemap/{n}.xml  키워드 문서 (3조각, 70,225개)
 *
 * Next 의 app/sitemap.ts 규약은 urlset 만 만들고 sitemapindex 는 못 만든다.
 * 그래서 라우트 핸들러로 직접 쓴다 (app/sitemap.ts 는 이 파일과 충돌하므로 제거했다).
 *
 * ⚠️ 키워드 조각 수는 coupang/keyword/sitemap.ts 의 CHUNK 와 같은 값으로 계산한다.
 *    한쪽만 바꾸면 인덱스가 없는 조각을 가리키거나 일부 조각을 빠뜨린다.
 */

/** ⚠️ src/app/coupang/keyword/sitemap.ts 의 CHUNK 와 일치해야 한다 */
const KEYWORD_SITEMAP_CHUNK = 25000;

/** 자식 사이트맵의 갱신일 — 각 사이트맵의 데이터 기준일과 맞춘다 */
const PAGES_UPDATED = "2026-09-24";
const CATEGORY_DATA_UPDATED = "2026-09-24";
const KEYWORD_DATA_UPDATED = "2026-09-24";

export function GET() {
  const keywordChunks = Math.ceil(getKeywordCount() / KEYWORD_SITEMAP_CHUNK);

  const children: { loc: string; lastmod: string }[] = [
    { loc: `${SITE_URL}/pages-sitemap.xml`, lastmod: PAGES_UPDATED },
    { loc: `${SITE_URL}/coupang/category/sitemap.xml`, lastmod: CATEGORY_DATA_UPDATED },
    ...Array.from({ length: keywordChunks }, (_, i) => ({
      loc: `${SITE_URL}/coupang/keyword/sitemap/${i}.xml`,
      lastmod: KEYWORD_DATA_UPDATED,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children
  .map(
    (c) => `  <sitemap>
    <loc>${c.loc}</loc>
    <lastmod>${c.lastmod}</lastmod>
  </sitemap>`
  )
  .join("\n")}
</sitemapindex>
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
