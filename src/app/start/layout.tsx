import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "쿠팡 셀러 시작 로드맵 | 사업자등록부터 입점까지 4단계",
  description:
    "쿠팡 판매를 처음 시작하는 왕초보 셀러를 위한 단계별 가이드. 사업자등록 → 통신판매업 → 건기식 → 쿠팡 윙 입점까지 체크리스트로 따라하세요.",
  keywords: [
    "쿠팡 입점",
    "쿠팡 사업자등록",
    "쿠팡 윙 입점",
    "통신판매업 신고",
    "쿠팡 셀러 시작",
    "쿠팡 창업",
    "쿠팡 입점 절차",
    "쿠팡PT",
    "쿠팡 판매 시작",
  ],
  alternates: { canonical: "/start" },
  openGraph: {
    title: "쿠팡 셀러 시작 로드맵 | 4단계로 끝내는 입점 준비",
    description:
      "사업자등록부터 쿠팡 윙 입점까지, 왕초보도 따라할 수 있는 단계별 체크리스트.",
    type: "article",
    locale: "ko_KR",
    url: `${SITE_URL}/start`,
    siteName: "쿠팡PT · 메가로드",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 셀러 시작 로드맵 | 4단계로 끝내는 입점 준비",
    description:
      "사업자등록부터 쿠팡 윙 입점까지, 왕초보도 따라할 수 있는 단계별 체크리스트.",
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

const startHowToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "@id": `${SITE_URL}/start#howto`,
  name: "쿠팡 셀러 시작하기 — 사업자등록부터 입점까지 4단계",
  description:
    "쿠팡 판매를 처음 시작하는 왕초보 셀러를 위한 단계별 가이드. 사업자등록 → 통신판매업 → 건기식 → 쿠팡 윙 입점까지 체크리스트.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "사업자등록",
      text: "홈택스에서 사업자등록 신청. 업태: 소매업, 종목: 전자상거래 소매업으로 등록합니다.",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "통신판매업 신고",
      text: "정부24에서 통신판매업 신고를 진행합니다. 사업자등록증 발급 후 가능합니다.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "건강기능식품 판매업 등록 (선택)",
      text: "건강기능식품을 판매할 경우 관할 보건소에 건강기능식품 판매업 등록을 합니다.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "쿠팡 윙 입점 신청",
      text: "쿠팡 윙(Wing)에서 판매자 입점 신청 후 승인을 받으면 상품 등록이 가능합니다.",
    },
  ],
  totalTime: "P7D",
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
