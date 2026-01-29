import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "쿠팡 셀러허브 | AI 기반 쿠팡 상품 등록 자동화",
  description: "AI가 상품명, 리뷰, 카테고리를 자동으로 생성하고 쿠팡에 등록합니다. 네이버 상품 원클릭 변환, 대량 등록 자동화로 시간을 99% 절약하세요.",
  keywords: "쿠팡 상품 등록, AI 상품명 생성, 네이버 쿠팡 변환, 쿠팡 자동 등록, 셀러허브, 쿠팡 판매자 도구",
  openGraph: {
    title: "쿠팡 셀러허브 | AI 기반 쿠팡 상품 등록 자동화",
    description: "AI가 상품명, 리뷰, 카테고리를 자동으로 생성하고 쿠팡에 등록합니다.",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 셀러허브 | AI 기반 쿠팡 상품 등록 자동화",
    description: "AI가 상품명, 리뷰, 카테고리를 자동으로 생성하고 쿠팡에 등록합니다.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900`}
      >
        {children}
      </body>
    </html>
  );
}
