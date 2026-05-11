import type { MetadataRoute } from "next";

const SITE_URL = "https://megaload.co.kr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/megaload/",
          "/my/",
          "/auth/",
          "/sign/",
          "/apply/",
          "/screening/",
          "/_next/",
        ],
      },
      // Naver crawler
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
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
