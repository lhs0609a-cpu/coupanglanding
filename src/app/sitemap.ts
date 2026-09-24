import type { MetadataRoute } from "next";
import { CHANNEL_ONBOARDING_GUIDES } from "@/lib/data/channel-onboarding-guides";
import { GUIDE_ARTICLES } from "@/lib/data/guide-articles";
import type { Channel } from "@/lib/megaload/types";

const SITE_URL = "https://megaload.co.kr";

/** 셀프 입점이 가능한 채널만 공개 가이드가 있다 (준비중 채널은 페이지 자체를 만들지 않음) */
const PUBLIC_CHANNELS = (Object.keys(CHANNEL_ONBOARDING_GUIDES) as Channel[])
  .filter((c) => CHANNEL_ONBOARDING_GUIDES[c]?.available);

/**
 * 정적 페이지·채널 가이드의 lastmod.
 *
 * new Date() 를 쓰면 배포할 때마다 모든 URL이 "오늘 수정됨"으로 나간다. 그러면 lastmod 가
 * 신호 역할을 잃고(구글은 신뢰할 수 없는 lastmod 를 무시한다), 네이버는 변경 없는 문서를
 * 반복 수집하게 된다. 해당 페이지를 실제로 고칠 때 이 날짜를 같이 올린다.
 *
 * ⚠️ 채널 가이드 날짜는 /rss.xml 의 CHANNEL_GUIDE_UPDATED 와 같은 값을 유지한다.
 */
const STATIC_UPDATED = new Date("2026-09-24");
const CHANNEL_GUIDE_UPDATED = new Date("2026-08-20");
/** 약관·개인정보·환불 정책 최종 개정일 */
const LEGAL_UPDATED = new Date("2026-08-01");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = STATIC_UPDATED;

  const articles: MetadataRoute.Sitemap = GUIDE_ARTICLES.map((a) => ({
    url: `${SITE_URL}/guide/${a.slug}`,
    lastModified: new Date(a.updated),
    changeFrequency: "monthly",
    priority: 0.75,
    alternates: { languages: { "ko-KR": `${SITE_URL}/guide/${a.slug}` } },
  }));

  const channelGuides: MetadataRoute.Sitemap = PUBLIC_CHANNELS.map((c) => ({
    url: `${SITE_URL}/guide/channel/${c}`,
    lastModified: CHANNEL_GUIDE_UPDATED,
    changeFrequency: "monthly",
    priority: 0.8,
    alternates: { languages: { "ko-KR": `${SITE_URL}/guide/channel/${c}` } },
  }));

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
      alternates: { languages: { "ko-KR": `${SITE_URL}/` } },
    },
    {
      url: `${SITE_URL}/pt`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.95,
      alternates: { languages: { "ko-KR": `${SITE_URL}/pt` } },
    },
    {
      url: `${SITE_URL}/program`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: { languages: { "ko-KR": `${SITE_URL}/program` } },
    },
    {
      url: `${SITE_URL}/guide`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: { languages: { "ko-KR": `${SITE_URL}/guide` } },
    },
    {
      url: `${SITE_URL}/start`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: { languages: { "ko-KR": `${SITE_URL}/start` } },
    },
    {
      url: `${SITE_URL}/return-guide`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: { languages: { "ko-KR": `${SITE_URL}/return-guide` } },
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: LEGAL_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: LEGAL_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/refund`,
      lastModified: LEGAL_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/supplier-program`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: { languages: { "ko-KR": `${SITE_URL}/supplier-program` } },
    },
    {
      url: `${SITE_URL}/guide/marketplace-comparison`,
      lastModified: CHANNEL_GUIDE_UPDATED,
      changeFrequency: "monthly",
      priority: 0.85,
      alternates: { languages: { "ko-KR": `${SITE_URL}/guide/marketplace-comparison` } },
    },
    ...channelGuides,
    ...articles,
  ];
}
