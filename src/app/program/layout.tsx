import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "셀러허브 | 쿠팡 상품 등록 자동화 프로그램",
  description: "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산까지 전부 자동화. 100개 상품 등록 10분이면 끝. 7일 무료 체험.",
  openGraph: {
    title: "셀러허브 | 쿠팡 상품 등록 자동화 프로그램",
    description: "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산까지 전부 자동화. 100개 상품 등록 10분.",
    type: "website",
    locale: "ko_KR",
    siteName: "쿠팡 셀러허브",
  },
  twitter: {
    card: "summary_large_image",
    title: "셀러허브 | 쿠팡 상품 등록 자동화 프로그램",
    description: "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산까지 전부 자동화. 100개 상품 등록 10분.",
  },
};

export default function ProgramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
