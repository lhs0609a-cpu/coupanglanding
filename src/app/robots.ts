import type { MetadataRoute } from "next";

const SITE_URL = "https://megaload.co.kr";

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
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
