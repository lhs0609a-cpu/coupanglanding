import { NextResponse } from "next/server";
import { CHANNEL_ONBOARDING_GUIDES } from "@/lib/data/channel-onboarding-guides";
import { GUIDE_ARTICLES } from "@/lib/data/guide-articles";
import { CHANNEL_LABELS } from "@/lib/megaload/constants";
import type { Channel } from "@/lib/megaload/types";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * RSS 2.0 피드 — 네이버 서치어드바이저 "RSS 제출" 용 + 일반 구독기
 *
 * ── 왜 sitemap 과 따로 있나 ──
 * 네이버는 sitemap.xml 과 RSS 를 다른 수집 경로로 쓴다. sitemap 은 "이 URL이 존재한다"를
 * 알리고, RSS 는 "새/갱신된 문서가 이거다"를 알린다. 네이버 웹마스터도구는 둘 다 등록하는
 * 것을 권장하고, RSS 쪽이 신규 문서 수집이 눈에 띄게 빠르다.
 *
 * ── 규칙 ──
 * 1) 콘텐츠 문서만 넣는다. /terms, /privacy, /apply 같은 기능·약관 페이지는 제외한다.
 *    RSS 에 비콘텐츠 URL을 섞으면 네이버가 피드 전체를 저품질로 본다.
 * 2) pubDate 는 고정된 발행일을 쓴다. new Date() 를 넣으면 요청마다 날짜가 바뀌어
 *    "매번 전부 새 글"로 보이고, 수집기가 피드를 신뢰하지 않게 된다.
 * 3) 최신순 정렬, 최대 MAX_ITEMS 개. (네이버 권장 50개 이하)
 */

/** 네이버 권장 상한. 이보다 많으면 오래된 문서부터 잘린다 */
const MAX_ITEMS = 50;

/**
 * 채널 입점 가이드는 아티클과 달리 날짜 필드가 없다.
 * 요청 시각을 쓰면 pubDate 가 매번 바뀌므로 문서가 실제로 갱신된 날을 손으로 적는다.
 * (채널 가이드 내용을 고칠 때 이 날짜도 같이 올린다)
 */
const CHANNEL_GUIDE_UPDATED = "2026-08-20";
/** 오픈마켓 비교표 갱신일 — 위와 같은 이유로 수동 관리 */
const COMPARISON_UPDATED = "2026-08-20";
/** 쿠팡 카테고리·키워드 자료 발행일 */
const DATASET_PUBLISHED = "2026-09-24";

const PUBLIC_CHANNELS = (Object.keys(CHANNEL_ONBOARDING_GUIDES) as Channel[])
  .filter((c) => CHANNEL_ONBOARDING_GUIDES[c]?.available);

interface FeedItem {
  url: string;
  title: string;
  description: string;
  /** ISO 날짜 (YYYY-MM-DD) */
  date: string;
  categories: string[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 는 RFC 822 날짜만 받는다. ISO 문자열을 그대로 넣으면 파싱 실패로 항목이 통째로 무시된다 */
function toRfc822(isoDate: string): string {
  // 한국 시간 09:00 발행으로 고정 — 날짜만 있는 값에 UTC 자정을 쓰면 하루 앞당겨 보인다
  const d = new Date(`${isoDate}T09:00:00+09:00`);
  return d.toUTCString();
}

function buildItems(): FeedItem[] {
  const articles: FeedItem[] = GUIDE_ARTICLES.map((a) => ({
    url: `${SITE_URL}/guide/${a.slug}`,
    title: a.title,
    description: a.description,
    date: a.updated || a.published,
    categories: a.keywords.slice(0, 5),
  }));

  const channelGuides: FeedItem[] = PUBLIC_CHANNELS.map((c) => {
    const g = CHANNEL_ONBOARDING_GUIDES[c];
    const label = CHANNEL_LABELS[c];
    return {
      url: `${SITE_URL}/guide/channel/${c}`,
      title: `${label} 입점 방법 + API 연동 가이드 (${g.estimatedTime})`,
      description:
        `${label} 판매자 가입부터 API 키 발급까지 단계별로 정리했습니다. ` +
        `${g.eligibility} · 준비물: ${g.documents.slice(0, 3).join(", ")} · ${g.settlementSummary}`,
      date: CHANNEL_GUIDE_UPDATED,
      categories: [`${label} 입점`, `${label} 수수료`, "오픈마켓 입점"],
    };
  });

  const comparison: FeedItem = {
    url: `${SITE_URL}/guide/marketplace-comparison`,
    title: "오픈마켓 입점 조건 비교 — 수수료·정산·서류·소요기간 총정리",
    description:
      "어디부터 시작할지 정하는 표. 쿠팡·네이버·11번가·G마켓·옥션·롯데온의 수수료, 정산 주기, 필요 서류, 심사 기간을 한눈에 비교했습니다.",
    date: COMPARISON_UPDATED,
    categories: ["오픈마켓 비교", "오픈마켓 수수료", "입점 조건"],
  };

  /**
   * 카테고리·키워드 자료의 **허브만** 넣는다.
   * 문서 자체는 8만 개라 RSS 에 넣을 수 없고 넣어서도 안 된다 — RSS 는 발행물 피드이고
   * 상한도 50개다. 대량 URL은 사이트맵 인덱스(/sitemap.xml)가 맡는다.
   */
  const datasets: FeedItem[] = [
    {
      url: `${SITE_URL}/coupang/category`,
      title: "쿠팡 카테고리별 판매수수료·필수속성 전체 목록",
      description:
        "쿠팡 카테고리 11,657개의 실제 판매수수료율(4~10.9%)과 상품 등록 시 반드시 입력해야 하는 속성을 카테고리별로 정리했습니다. 판매가별 실수령액까지 함께 볼 수 있습니다.",
      date: DATASET_PUBLISHED,
      categories: ["쿠팡 카테고리 수수료", "쿠팡 판매수수료", "쿠팡 필수속성", "쿠팡 상품등록"],
    },
    {
      url: `${SITE_URL}/coupang/keyword`,
      title: "상품 키워드 월 검색량 — 네이버 실검색량 69,522개",
      description:
        "상품 키워드 69,522개의 네이버 월 검색량과 경쟁 정도입니다. PC·모바일 검색량 분해와, 쿠팡에서 팔 때의 카테고리·판매수수료까지 키워드별로 확인할 수 있습니다.",
      date: DATASET_PUBLISHED,
      categories: ["키워드 검색량", "네이버 검색량 조회", "소싱 키워드", "쿠팡 키워드"],
    },
  ];

  return [...articles, ...channelGuides, comparison, ...datasets]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ITEMS);
}

function renderItem(item: FeedItem): string {
  const categories = item.categories
    .map((c) => `      <category>${escapeXml(c)}</category>`)
    .join("\n");

  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${toRfc822(item.date)}</pubDate>
      <author>help@megaload.co.kr (메가로드)</author>
${categories}
    </item>`;
}

function buildFeed(): string {
  const items = buildItems();
  // lastBuildDate 도 가장 최신 문서 날짜를 따른다 (요청 시각을 쓰면 매번 "갱신됨"으로 보인다)
  const lastBuild = items.length > 0 ? toRfc822(items[0].date) : toRfc822("2026-08-18");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>쿠팡PT · 메가로드 — 쿠팡 셀러 가이드</title>
    <link>${SITE_URL}/guide</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>쿠팡 위탁판매·오픈마켓 입점·상품등록 자동화까지, 실제로 따라 할 수 있는 셀러 실무 가이드를 발행합니다.</description>
    <language>ko</language>
    <copyright>© 플라트마케팅</copyright>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>megaload.co.kr</generator>
    <image>
      <url>${SITE_URL}/opengraph-image</url>
      <title>쿠팡PT · 메가로드 — 쿠팡 셀러 가이드</title>
      <link>${SITE_URL}/guide</link>
    </image>
${items.map(renderItem).join("\n")}
  </channel>
</rss>
`;
}

export function GET() {
  return new NextResponse(buildFeed(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
