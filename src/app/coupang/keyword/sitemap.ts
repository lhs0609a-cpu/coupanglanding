import type { MetadataRoute } from "next";
import {
  getAllKeywords,
  getGroupCounts,
  KEYWORDS_PER_PAGE,
} from "@/lib/data/seo-keywords";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 키워드 문서 사이트맵 → /coupang/keyword/sitemap/{0..N}.xml
 *
 * 사이트맵 1개당 상한은 URL 50,000개다. 키워드만 75,748개라 한 파일에 못 담는다.
 * generateSitemaps 로 쪼갠다. robots.txt 에 각 조각을 모두 적어 둔다.
 *
 * ⚠️ lastModified 에 new Date() 를 쓰지 않는다. 배포마다 7만 개가 "오늘 수정됨"으로
 *    나가면 구글은 lastmod 를 신뢰하지 않게 되고 네이버는 같은 문서를 반복 수집한다.
 *    키워드를 다시 수집할 때만 이 날짜를 올린다.
 */

/** 키워드 수집 기준일 */
const KEYWORD_DATA_UPDATED = new Date("2026-09-24");

/** 조각당 URL 수 — 상한 50,000 의 절반으로 여유를 둔다 */
const CHUNK = 25000;

export function generateSitemaps() {
  const total = getAllKeywords().length;
  const chunks = Math.ceil(total / CHUNK);
  // 목록 페이지는 0번 조각에 함께 넣으므로 조각 수는 키워드 기준으로만 센다
  return Array.from({ length: chunks }, (_, id) => ({ id }));
}

/**
 * ⚠️ Next 16 은 generateSitemaps 의 id 를 **Promise 로** 넘긴다 (params 와 같은 취급).
 *    await 없이 읽으면 Promise 객체가 그대로 들어와 Number(...) 가 NaN 이 되고,
 *    slice(NaN, NaN) 이 빈 배열을 돌려준다 — 에러 없이 빈 사이트맵이 나간다.
 *    (실제로 그렇게 나갔다: 200 인데 <loc> 0개, 그다음엔 세 조각이 전부 같은 내용)
 *    버전에 따라 `{ id }` / `{ params: { id } }` / 동기 값도 있으므로 전부 받아 준다.
 */
type SitemapArg = {
  id?: number | string | Promise<number | string>;
  params?: { id?: number | string } | Promise<{ id?: number | string }>;
};

async function resolveId(props: SitemapArg): Promise<number> {
  let raw: unknown = await Promise.resolve(props?.id);
  if (raw === undefined) {
    const p = await Promise.resolve(props?.params);
    raw = p && typeof p === "object" ? (p as { id?: number | string }).id : undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export default async function sitemap(props: SitemapArg): Promise<MetadataRoute.Sitemap> {
  const id = await resolveId(props);

  const all = getAllKeywords();
  const slice = all.slice(id * CHUNK, (id + 1) * CHUNK);

  const docs: MetadataRoute.Sitemap = slice.map((k) => {
    const url = `${SITE_URL}/coupang/keyword/${encodeURIComponent(k.keyword)}`;
    return {
      url,
      lastModified: KEYWORD_DATA_UPDATED,
      changeFrequency: "monthly",
      // 검색량이 큰 키워드에 더 높은 우선순위. 월 1만 이상 0.7 → 월 100대 0.3
      priority:
        k.totalSearch >= 10000
          ? 0.7
          : k.totalSearch >= 1000
            ? 0.55
            : k.totalSearch >= 300
              ? 0.4
              : 0.3,
      alternates: { languages: { "ko-KR": url } },
    };
  });

  if (id !== 0) return docs;

  // 0번 조각에만 허브와 목록 페이지를 넣는다
  const hub: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/coupang/keyword`,
      lastModified: KEYWORD_DATA_UPDATED,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: { languages: { "ko-KR": `${SITE_URL}/coupang/keyword` } },
    },
  ];

  const lists: MetadataRoute.Sitemap = [];
  for (const g of getGroupCounts()) {
    const pages = Math.ceil(g.count / KEYWORDS_PER_PAGE);
    for (let p = 1; p <= pages; p++) {
      const url = `${SITE_URL}/coupang/keyword/list/${g.groupId}/${p}`;
      lists.push({
        url,
        lastModified: KEYWORD_DATA_UPDATED,
        changeFrequency: "monthly",
        // 1쪽이 가장 중요하고 뒤로 갈수록 낮춘다
        priority: p === 1 ? 0.65 : 0.4,
        alternates: { languages: { "ko-KR": url } },
      });
    }
  }

  return [...hub, ...lists, ...docs];
}
