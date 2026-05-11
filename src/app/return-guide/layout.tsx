import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "쿠팡 반품·교환 처리 가이드 | 셀러를 위한 CS 매뉴얼",
  description:
    "쿠팡 셀러를 위한 반품·교환·CS 처리 매뉴얼. 단순 변심, 상품 불량, 배송 사고 등 상황별 대응 방법과 비용 정산까지.",
  keywords: [
    "쿠팡 반품",
    "쿠팡 교환",
    "쿠팡 CS",
    "쿠팡 반품 처리",
    "쿠팡 환불",
    "쿠팡 셀러 반품",
    "쿠팡PT",
  ],
  alternates: { canonical: "/return-guide" },
  openGraph: {
    title: "쿠팡 반품·교환 처리 가이드",
    description: "쿠팡 셀러를 위한 반품·교환·CS 처리 매뉴얼.",
    type: "article",
    locale: "ko_KR",
    url: `${SITE_URL}/return-guide`,
    siteName: "쿠팡PT · 메가로드",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 반품·교환 처리 가이드",
    description: "쿠팡 셀러를 위한 반품·교환·CS 처리 매뉴얼.",
  },
};

export default function ReturnGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
