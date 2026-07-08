import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "공급사 파트너 모집 | 메가로드 — 상품만 올리면 셀러망이 판매",
  description:
    "제조사·도매·공급사라면 상품 한 번만 등록하세요. 메가로드 셀러망이 각자 쿠팡 채널에서 유니크 SEO로 판매하고, 실제 판매가 일어난 만큼만 수수료 10%를 냅니다. 초기비용·월정액 0원.",
  keywords: [
    "공급사 모집",
    "도매 위탁판매",
    "제조사 판로",
    "쿠팡 위탁판매 공급",
    "무재고 판매 공급사",
    "셀러 매칭",
    "메가로드 공급사",
    "브랜드 입점",
    "상품 공급 파트너",
  ],
  alternates: {
    canonical: "/supplier-program",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${SITE_URL}/supplier-program`,
    siteName: "쿠팡PT · 메가로드",
    title: "공급사 파트너 모집 | 메가로드",
    description:
      "상품 한 번 등록 → 셀러망이 각자 채널에서 판매 → 판매분만 수수료 10%. 초기비용 0원.",
  },
  twitter: {
    card: "summary_large_image",
    title: "공급사 파트너 모집 | 메가로드",
    description: "상품 한 번 등록 → 셀러망 판매 → 판매분만 수수료 10%.",
  },
};

const supplierBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "쿠팡PT 메가로드", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "공급사 파트너", item: `${SITE_URL}/supplier-program` },
  ],
};

export default function SupplierProgramLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(supplierBreadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
