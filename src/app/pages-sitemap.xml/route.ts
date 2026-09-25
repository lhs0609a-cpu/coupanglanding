import { NextResponse } from "next/server";
import { CHANNEL_ONBOARDING_GUIDES } from "@/lib/data/channel-onboarding-guides";
import { GUIDE_ARTICLES } from "@/lib/data/guide-articles";
import type { Channel } from "@/lib/megaload/types";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 핵심 페이지 사이트맵 → /pages-sitemap.xml
 *
 * 원래 /sitemap.xml 이 이 내용이었다. /sitemap.xml 은 이제 **사이트맵 인덱스**가 되어
 * 이 파일과 카테고리·키워드 사이트맵을 가리킨다. 검색엔진에는 /sitemap.xml 하나만
 * 제출하면 전부 따라 들어간다.
 *
 * Next 의 app/sitemap.ts 규약은 urlset 만 만들 수 있고 sitemapindex 는 못 만든다.
 * 그래서 인덱스를 라우트 핸들러로 직접 쓰고, 그 자식인 이 파일도 같은 방식으로 맞췄다.
 *
 * ⚠️ lastmod 에 new Date() 를 쓰지 않는다. 배포마다 전 URL이 "오늘 수정됨"으로 나가면
 *    구글은 lastmod 를 무시하고 네이버는 변경 없는 문서를 반복 수집한다.
 *    페이지를 실제로 고칠 때 아래 상수를 같이 올린다.
 */

const STATIC_UPDATED = "2026-09-24";
/** ⚠️ /rss.xml 의 CHANNEL_GUIDE_UPDATED 와 같은 값을 유지한다 */
const CHANNEL_GUIDE_UPDATED = "2026-08-20";
/** 약관·개인정보·환불 정책 최종 개정일 */
const LEGAL_UPDATED = "2026-08-01";

/** 셀프 입점이 가능한 채널만 공개 가이드가 있다 */
const PUBLIC_CHANNELS = (Object.keys(CHANNEL_ONBOARDING_GUIDES) as Channel[]).filter(
  (c) => CHANNEL_ONBOARDING_GUIDES[c]?.available
);

interface Entry {
  path: string;
  lastmod: string;
  changefreq: string;
  priority: number;
  /** 한국어 대체 링크를 넣을지 (약관류는 생략) */
  hreflang?: boolean;
}

const ENTRIES: Entry[] = [
  { path: "/", lastmod: STATIC_UPDATED, changefreq: "weekly", priority: 1.0, hreflang: true },
  { path: "/pt", lastmod: STATIC_UPDATED, changefreq: "weekly", priority: 0.95, hreflang: true },
  { path: "/program", lastmod: STATIC_UPDATED, changefreq: "weekly", priority: 0.9, hreflang: true },
  { path: "/guide", lastmod: STATIC_UPDATED, changefreq: "monthly", priority: 0.7, hreflang: true },
  { path: "/start", lastmod: STATIC_UPDATED, changefreq: "monthly", priority: 0.7, hreflang: true },
  { path: "/return-guide", lastmod: STATIC_UPDATED, changefreq: "monthly", priority: 0.5, hreflang: true },
  { path: "/supplier-program", lastmod: STATIC_UPDATED, changefreq: "monthly", priority: 0.7, hreflang: true },
  {
    path: "/guide/marketplace-comparison",
    lastmod: CHANNEL_GUIDE_UPDATED,
    changefreq: "monthly",
    priority: 0.85,
    hreflang: true,
  },
  // 카테고리·키워드 허브도 여기서 한 번 더 알린다 (각자 사이트맵에도 들어 있다)
  { path: "/coupang/category", lastmod: STATIC_UPDATED, changefreq: "monthly", priority: 0.8, hreflang: true },
  { path: "/coupang/keyword", lastmod: STATIC_UPDATED, changefreq: "weekly", priority: 0.8, hreflang: true },
  { path: "/terms", lastmod: LEGAL_UPDATED, changefreq: "yearly", priority: 0.3 },
  { path: "/privacy", lastmod: LEGAL_UPDATED, changefreq: "yearly", priority: 0.3 },
  { path: "/refund", lastmod: LEGAL_UPDATED, changefreq: "yearly", priority: 0.3 },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderUrl(e: Entry): string {
  const loc = escapeXml(`${SITE_URL}${e.path}`);
  const alt = e.hreflang
    ? `\n    <xhtml:link rel="alternate" hreflang="ko-KR" href="${loc}" />`
    : "";
  return `  <url>
    <loc>${loc}</loc>${alt}
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`;
}

export function GET() {
  const channelGuides: Entry[] = PUBLIC_CHANNELS.map((c) => ({
    path: `/guide/channel/${c}`,
    lastmod: CHANNEL_GUIDE_UPDATED,
    changefreq: "monthly",
    priority: 0.8,
    hreflang: true,
  }));

  const articles: Entry[] = GUIDE_ARTICLES.map((a) => ({
    path: `/guide/${a.slug}`,
    lastmod: a.updated,
    changefreq: "monthly",
    priority: 0.75,
    hreflang: true,
  }));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...ENTRIES, ...channelGuides, ...articles].map(renderUrl).join("\n")}
</urlset>
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
