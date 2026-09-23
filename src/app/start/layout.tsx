import type { Metadata } from "next";
import { ROADMAP_STEPS } from "@/lib/data/start-roadmap";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "쿠팡 셀러 시작 로드맵 | 사업자등록부터 상품 업로드까지 15단계",
  description:
    "쿠팡 판매를 처음 시작하는 왕초보 셀러를 위한 단계별 가이드. 사업자등록(토스) → 통신판매업 → 쿠팡 윙 입점 → API 연동 → 첫 상품 등록·승인까지, 따라만 하면 되는 체크리스트.",
  keywords: [
    "쿠팡 입점",
    "쿠팡 사업자등록",
    "토스 사업자등록",
    "토스 통신판매업 신고",
    "쿠팡 윙 입점",
    "쿠팡 API 연동",
    "통신판매업 신고",
    "쿠팡 상품등록",
    "쿠팡 셀러 시작",
    "쿠팡 창업",
    "쿠팡 입점 절차",
    "쿠팡PT",
    "쿠팡 판매 시작",
  ],
  alternates: { canonical: "/start" },
  openGraph: {
    title: "쿠팡 셀러 시작 로드맵 | 사업자등록부터 첫 상품 업로드까지",
    description:
      "설치할 프로그램 없이, 사업자등록부터 첫 상품 등록·승인까지 따라만 하면 되는 15단계 체크리스트.",
    type: "article",
    locale: "ko_KR",
    url: `${SITE_URL}/start`,
    siteName: "쿠팡PT · 메가로드",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 셀러 시작 로드맵 | 사업자등록부터 첫 상품 업로드까지",
    description:
      "설치할 프로그램 없이, 사업자등록부터 첫 상품 등록·승인까지 따라만 하면 되는 15단계 체크리스트.",
  },
};

const startBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "쿠팡PT 메가로드",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "셀러 시작 로드맵",
      item: `${SITE_URL}/start`,
    },
  ],
};

// 화면에 뜨는 단계와 구조화 데이터가 어긋나면 검색엔진에도 사람에게도 거짓말이 된다.
// 그래서 손으로 적지 않고 같은 데이터에서 만든다.
const totalWaitDays = ROADMAP_STEPS.reduce((sum, s) => sum + s.estimatedDays, 0);

const startHowToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": `${SITE_URL}/start#howto`,
  name: `쿠팡 셀러 시작하기 — 사업자등록부터 상품 업로드까지 ${ROADMAP_STEPS.length}단계`,
  description:
    "쿠팡 판매를 처음 시작하는 왕초보 셀러를 위한 단계별 가이드. 사업자등록부터 첫 상품 등록·승인 확인까지 체크리스트로 따라합니다.",
  estimatedCost: {
    "@type": "MonetaryAmount",
    currency: "KRW",
    value: "60000",
  },
  step: ROADMAP_STEPS.map((s) => ({
    "@type": "HowToStep",
    position: s.number,
    name: s.title,
    text: s.subtitle,
    url: `${SITE_URL}/start#step-${s.number}`,
    itemListElement: s.subSteps.map((ss) => ({
      "@type": "HowToDirection",
      text: ss.label,
    })),
  })),
  totalTime: `P${Math.max(totalWaitDays, 1)}D`,
  inLanguage: "ko-KR",
};

export default function StartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(startBreadcrumbJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(startHowToJsonLd),
        }}
      />
      {children}
    </>
  );
}
