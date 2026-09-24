import type { MetadataRoute } from "next";
import { getIndexableCategories } from "@/lib/data/coupang-categories";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 쿠팡 카테고리 문서 전용 사이트맵 → /coupang/category/sitemap.xml
 *
 * 메인 sitemap.xml 과 분리한 이유: 카테고리만 16,259개라 한 파일에 합치면 메인 사이트맵이
 * 수 MB 가 되고, 정작 중요한 /pt·/program·가이드가 그 안에 묻힌다. 수집기가 어느 쪽을
 * 먼저 처리할지도 통제할 수 없다.
 *
 * 사이트맵 1개당 상한은 URL 50,000개 / 50MB 다. 16,259개는 한 파일에 들어간다.
 * 카테고리가 이 상한을 넘기면 generateSitemaps 로 쪼갠다.
 *
 * ⚠️ lastModified 에 new Date() 를 쓰지 않는다. 배포마다 16,259개가 전부 "오늘 수정됨"으로
 *    나가면 구글은 lastmod 를 신뢰하지 않게 되고 네이버는 같은 문서를 반복 수집한다.
 *    카테고리 원본 데이터를 갱신할 때만 이 날짜를 올린다.
 */

/** 쿠팡 카테고리 원본 데이터 기준일 */
const CATEGORY_DATA_UPDATED = new Date("2026-09-24");

export default function sitemap(): MetadataRoute.Sitemap {
  // 색인 가치가 없는 묶음(도서>외국도서)은 사이트맵에 넣지 않는다
  const categories = getIndexableCategories();

  const hub: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/coupang/category`,
      lastModified: CATEGORY_DATA_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: { languages: { "ko-KR": `${SITE_URL}/coupang/category` } },
    },
  ];

  const docs: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/coupang/category/${c.id}`,
    lastModified: CATEGORY_DATA_UPDATED,
    changeFrequency: "monthly",
    // 상위 depth 일수록 검색 수요가 크다. 3depth 0.6 → 6depth 0.3
    priority: Math.max(0.3, 0.75 - c.depth * 0.05),
    alternates: { languages: { "ko-KR": `${SITE_URL}/coupang/category/${c.id}` } },
  }));

  return [...hub, ...docs];
}
