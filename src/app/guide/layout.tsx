import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "쿠팡 위탁판매 왕초보 가이드 | 재고 0개로 시작하는 온라인 판매",
  description:
    "위탁판매가 뭔지 모르는 완전 초보를 위한 가이드. 재고 없이, 투자금 없이, 집에서 쿠팡으로 수익 만드는 방법을 쉽게 알려드립니다. 쿠팡PT 무료 코칭과 함께.",
  keywords: [
    "쿠팡 위탁판매",
    "쿠팡 왕초보",
    "쿠팡 부업",
    "쿠팡 시작",
    "쿠팡 셀러 가이드",
    "재고 없이 판매",
    "쿠팡PT",
    "쿠팡 무자본 창업",
    "쿠팡 부업 추천",
    "쿠팡 위탁",
  ],
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "쿠팡 위탁판매 왕초보 가이드",
    description:
      "재고 0개, 사무실 0평, 투자금 0원 — 쿠팡에서 매달 수익 만드는 법",
    type: "article",
    locale: "ko_KR",
    url: `${SITE_URL}/guide`,
    siteName: "쿠팡PT · 메가로드",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 위탁판매 왕초보 가이드",
    description:
      "재고 0개, 사무실 0평, 투자금 0원 — 쿠팡에서 매달 수익 만드는 법",
  },
};

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
