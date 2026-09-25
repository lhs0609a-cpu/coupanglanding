import type { MetadataRoute } from "next";

const SITE_URL = "https://www.megaload.co.kr";

export default function robots(): MetadataRoute.Robots {
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
    // /sitemap.xml 은 사이트맵 **인덱스**다. 카테고리·키워드 사이트맵이 그 안에서
    // 따라 들어가므로 여기에 자식들을 늘어놓을 필요가 없다.
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/rss.xml`],
    host: SITE_URL,
  };
}
