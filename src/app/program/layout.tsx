import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "메가로드 | 쿠팡 상품 등록 자동화 프로그램 (AI 대량등록)",
  description:
    "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산, 옵션·재고까지 전부 자동화. 쿠팡 100개 상품 등록 10분이면 끝. 1일 무료 체험 제공.",
  keywords: [
    "메가로드",
    "Megaload",
    "쿠팡 자동등록",
    "쿠팡 대량등록",
    "쿠팡 상품등록 자동화",
    "쿠팡 AI 상품명",
    "쿠팡 카테고리 매칭",
    "쿠팡 Wing 자동화",
    "쿠팡 위탁판매 프로그램",
    "쿠팡PT",
  ],
  alternates: {
    canonical: "/program",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${SITE_URL}/program`,
    siteName: "쿠팡PT · 메가로드",
    title: "메가로드 | 쿠팡 상품 등록 자동화 프로그램",
    description:
      "GPT-4 AI 기반 쿠팡 상품 대량등록 자동화. 100개 등록 10분. 1일 무료 체험.",
  },
  twitter: {
    card: "summary_large_image",
    title: "메가로드 | 쿠팡 상품 등록 자동화 프로그램",
    description:
      "GPT-4 AI 기반 쿠팡 상품 대량등록 자동화. 100개 등록 10분.",
  },
};

const programBreadcrumbJsonLd = {
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
      name: "메가로드 프로그램",
      item: `${SITE_URL}/program`,
    },
  ],
};

const programSoftwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/program#app`,
  name: "메가로드 (Megaload)",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "GPT-4 기반 쿠팡 상품 대량등록 자동화 프로그램. 카테고리 매칭, 노출상품명, 가격·옵션·재고를 자동화해 100개 등록을 10분 이내로 단축합니다.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
    description: "1일 무료 체험 제공",
  },
  url: `${SITE_URL}/program`,
  provider: {
    "@type": "Organization",
    name: "플라트마케팅",
    url: SITE_URL,
  },
  featureList: [
    "GPT-4 AI 카테고리 자동 매칭",
    "노출상품명 자동 생성",
    "가격·옵션·재고 자동화",
    "100개 상품 10분 대량등록",
    "쿠팡 Wing 자동 연동",
  ],
};

export default function ProgramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(programBreadcrumbJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(programSoftwareJsonLd),
        }}
      />
      {children}
    </>
  );
}
