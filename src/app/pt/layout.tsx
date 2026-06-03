import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "쿠팡PT — 초기비용 0원, 3개월 매출 보장형 1:1 쿠팡 전문가 코칭",
  description:
    "쿠팡PT 공식 페이지. 초기비용 0원으로 시작해 검증된 전문가가 1:1로 쿠팡 매출을 함께 만듭니다. 못 만들면 0원. 부업·초보 셀러·창업자 모두 가능.",
  keywords: [
    "쿠팡PT",
    "쿠팡 PT",
    "쿠팡pt",
    "쿠팡 1:1 코칭",
    "쿠팡 전문가",
    "쿠팡 컨설팅",
    "쿠팡 매출 보장",
    "쿠팡 셀러 교육",
    "쿠팡 부업",
    "쿠팡 창업 컨설팅",
    "쿠팡 위탁판매 교육",
    "쿠팡 광고 ROAS",
  ],
  alternates: {
    canonical: "/pt",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${SITE_URL}/pt`,
    siteName: "쿠팡PT · 메가로드",
    title: "쿠팡PT | 초기비용 0원, 3개월 매출 보장형 1:1 전문가 코칭",
    description:
      "쿠팡PT — 검증된 전문가가 1:1로 매출을 만듭니다. 초기비용 0원, 못 만들면 0원.",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡PT | 초기비용 0원, 3개월 매출 보장형 1:1 전문가 코칭",
    description:
      "쿠팡PT — 검증된 전문가가 1:1로 매출을 만듭니다. 초기비용 0원, 못 만들면 0원.",
  },
};

const ptFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/pt#faq`,
  mainEntity: [
    {
      "@type": "Question",
      name: "쿠팡PT는 정말 0원으로 시작할 수 있나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "네. 초기비용, 셋업비, 교육비 모두 0원입니다. 매출이 발생해서 순이익이 생겼을 때만 30%를 정산합니다. 매출이 없으면 저희도 수익이 없는 성과 기반 구조입니다.",
      },
    },
    {
      "@type": "Question",
      name: "쿠팡PT는 어떤 분에게 적합한가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "쿠팡 경험이 전혀 없는 초보 셀러, 부업으로 시작하려는 직장인, 독학으로 한계에 부딪힌 셀러, 매출을 본격적으로 키우고 싶은 분 모두에게 적합합니다.",
      },
    },
    {
      "@type": "Question",
      name: "쿠팡PT 교육은 어떤 방식인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "실시간 메시지 답변, 화면공유 1:1 코칭, 전화 상담을 병행합니다. 오전 10시부터 오후 9시까지 상시 응대하며 숙련될 때까지 전담으로 교육합니다.",
      },
    },
    {
      "@type": "Question",
      name: "쿠팡PT 정산은 어떻게 진행되나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "매월 1회 정산합니다. 해당 월의 쿠팡 정산금에서 상품 원가, 배송비, 광고비 등을 차감한 순이익의 30%를 정산하며 상세 리포트를 함께 제공합니다.",
      },
    },
    {
      "@type": "Question",
      name: "쿠팡PT 계약 기간이 끝나면 어떻게 되나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "계약 만료 30일 전까지 해지 통보가 없으면 동일 조건으로 1년 자동 연장됩니다. 해지를 원하면 30일 전 서면 통보하시면 됩니다.",
      },
    },
    {
      "@type": "Question",
      name: "쿠팡PT는 부업으로도 가능한가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "네, 가능합니다. 실제로 직장 다니시면서 시작하는 분이 많고, 주 5~10시간 정도면 충분합니다. 시간이 많이 드는 작업은 자동화 프로그램과 전담 교육으로 단축합니다.",
      },
    },
  ],
};

const ptBreadcrumbJsonLd = {
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
      name: "쿠팡PT",
      item: `${SITE_URL}/pt`,
    },
  ],
};

export default function PTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ptFaqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ptBreadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
