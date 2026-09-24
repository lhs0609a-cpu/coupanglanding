import type { MetadataRoute } from "next";
import { getKeywordCount } from "@/lib/data/seo-keywords";

const SITE_URL = "https://www.megaload.co.kr";

/** 키워드 사이트맵 조각 — sitemap.ts 의 CHUNK 와 같은 값이어야 한다 */
const KEYWORD_SITEMAP_CHUNK = 25000;

export default function robots(): MetadataRoute.Robots {
  // 메타 파일의 개수만 쓴다 — robots 가 4.5MB 인덱스를 열 이유가 없다
  const keywordChunks = Math.ceil(getKeywordCount() / KEYWORD_SITEMAP_CHUNK);
  const keywordSitemaps = Array.from(
    { length: keywordChunks },
    (_, i) => `${SITE_URL}/coupang/keyword/sitemap/${i}.xml`
  );

  const publicDisallow = [
    "/api/",
    "/admin/",
    "/megaload/",
    "/my/",
    "/auth/",
    "/sign/",
    "/apply/",
    "/screening/",
    "/_next/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: publicDisallow,
      },
      // ── 검색엔진 크롤러 ──
      // Naver
      { userAgent: "Yeti", allow: "/" },
      { userAgent: "NaverBot", allow: "/" },
      // Google
      { userAgent: "Googlebot", allow: "/" },
      { userAgent: "Googlebot-Image", allow: "/" },
      // Bing
      { userAgent: "Bingbot", allow: "/" },
      // Daum
      { userAgent: "Daum", allow: "/" },
      { userAgent: "Daumoa", allow: "/" },

      // ── AI 검색 크롤러 (Google AI Overview, ChatGPT, Perplexity 등) ──
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "GPTBot", allow: "/", disallow: publicDisallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow: publicDisallow },
      { userAgent: "ClaudeBot", allow: "/", disallow: publicDisallow },
      { userAgent: "anthropic-ai", allow: "/", disallow: publicDisallow },
      { userAgent: "PerplexityBot", allow: "/", disallow: publicDisallow },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "cohere-ai", allow: "/", disallow: publicDisallow },
    ],
    // sitemap 과 RSS 를 둘 다 알린다.
    // 네이버·구글 모두 RSS 를 사이트맵의 한 종류로 받아들이고, 신규 문서 수집은 RSS 쪽이 빠르다.
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      // 쿠팡 카테고리 문서는 별도 사이트맵. 메인에 합치면 /pt·/program 이 묻힌다.
      `${SITE_URL}/coupang/category/sitemap.xml`,
      // 키워드 문서는 7만 개가 넘어 사이트맵 1개 상한(50,000)을 넘는다 → 조각으로 나눠 전부 고지
      ...keywordSitemaps,
      `${SITE_URL}/rss.xml`,
    ],
    host: SITE_URL,
  };
}
