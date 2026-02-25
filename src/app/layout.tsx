import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "쿠팡 셀러허브 | AI 기반 쿠팡 상품 등록 자동화",
  description: "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산까지 전부 자동화. 100개 상품 등록 10분이면 끝. 전문가 1:1 PT도 함께.",
  keywords: "쿠팡 상품 등록, AI 상품명 생성, 쿠팡 자동 등록, 셀러허브, 쿠팡 PT, 쿠팡 판매자 도구, 대량 등록, 카테고리 매칭",
  openGraph: {
    title: "쿠팡 셀러허브 | AI 기반 쿠팡 상품 등록 자동화",
    description: "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산까지 전부 자동화합니다.",
    type: "website",
    locale: "ko_KR",
    siteName: "쿠팡 셀러허브",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 셀러허브 | AI 기반 쿠팡 상품 등록 자동화",
    description: "GPT-4 AI가 카테고리 매칭, 상품명 생성, 가격 계산까지 전부 자동화합니다.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} antialiased bg-white text-gray-900`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded-lg focus:shadow-lg focus:ring-2 focus:ring-[#E31837]"
        >
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
