import type { MetadataRoute } from "next";
import { CHANNEL_ONBOARDING_GUIDES } from "@/lib/data/channel-onboarding-guides";
import type { Channel } from "@/lib/megaload/types";

const SITE_URL = "https://megaload.co.kr";

/** 셀프 입점이 가능한 채널만 공개 가이드가 있다 (준비중 채널은 페이지 자체를 만들지 않음) */
const PUBLIC_CHANNELS = (Object.keys(CHANNEL_ONBOARDING_GUIDES) as Channel[])
  .filter((c) => CHANNEL_ONBOARDING_GUIDES[c]?.available);

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const channelGuides: MetadataRoute.Sitemap = PUBLIC_CHANNELS.map((c) => ({
    url: `${SITE_URL}/guide/channel/${c}`,
    lastModified: now,
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
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/refund`,
      lastModified: now,
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
    ...channelGuides,
  ];
}
