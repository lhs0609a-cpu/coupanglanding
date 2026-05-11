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

export default function ProgramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
