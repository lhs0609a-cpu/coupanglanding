import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import GlobalErrorCapture from "@/components/system/GlobalErrorCapture";
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
  weight: ["400", "600", "700"],
});

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "쿠팡PT | 쿠팡 1:1 전문가 코칭 + AI 자동등록 프로그램 — 메가로드",
    template: "%s | 쿠팡PT 메가로드",
  },
  description:
    "쿠팡PT 공식 안내. 초기비용 0원, 3개월 매출 보장형 1:1 쿠팡 전문가 코칭(PT)과 GPT-4 AI 기반 쿠팡 상품 대량등록 자동화 프로그램 메가로드. 쿠팡 셀러·부업·초보자 모두 가능.",
  keywords: [
    "쿠팡PT",
    "쿠팡 PT",
    "쿠팡pt",
    "쿠팡 1:1 코칭",
    "쿠팡 컨설팅",
    "쿠팡 매출 보장",
    "쿠팡 셀러 교육",
    "쿠팡 부업",
    "쿠팡 창업",
    "쿠팡 자동등록",
    "쿠팡 대량등록",
    "쿠팡 상품등록 자동화",
    "쿠팡 AI 상품명",
    "쿠팡 Wing 자동화",
    "메가로드",
    "Megaload",
    "쿠팡 카테고리 매칭",
    "쿠팡 위탁판매",
    "쿠팡 광고 ROAS",
  ],
  authors: [{ name: "플라트마케팅" }],
  creator: "플라트마케팅",
  publisher: "플라트마케팅",
  applicationName: "쿠팡PT · 메가로드",
  category: "ecommerce",
  alternates: {
    canonical: "/",
    languages: {
      "ko-KR": "/",
      "x-default": "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "쿠팡PT · 메가로드",
    title: "쿠팡PT | 1:1 전문가 코칭 + AI 자동등록 — 메가로드",
    description:
      "초기비용 0원, 3개월 매출 보장형 쿠팡PT. GPT-4 AI가 카테고리 매칭·상품명·가격·대량등록을 자동화하는 메가로드와 함께 시작하세요.",
    // OG image is auto-injected from src/app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡PT | 1:1 전문가 코칭 + AI 자동등록 — 메가로드",
    description:
      "초기비용 0원 쿠팡PT + GPT-4 AI 기반 쿠팡 상품 대량등록 자동화. 100개 등록 10분.",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: {
      ...(process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION && {
        "naver-site-verification":
          process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION,
      }),
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION && {
        "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
      }),
      ...(process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION && {
        "yandex-verification":
          process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION,
      }),
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#E31837",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// JSON-LD: Organization + WebSite + Service(쿠팡PT) + SoftwareApplication(메가로드)
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "플라트마케팅",
      alternateName: ["메가로드", "Megaload", "쿠팡PT"],
      url: SITE_URL,
      sameAs: [SITE_URL],
      address: {
        "@type": "PostalAddress",
        addressCountry: "KR",
        addressRegion: "경기도",
        addressLocality: "용인시",
        streetAddress: "기흥구 강남서로 9, 7층 703호-b721",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "쿠팡PT · 메가로드",
      inLanguage: "ko-KR",
      description:
        "쿠팡PT 1:1 전문가 코칭과 AI 기반 쿠팡 상품 등록 자동화 프로그램 메가로드 공식 홈페이지",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Service",
      "@id": `${SITE_URL}/#coupang-pt`,
      name: "쿠팡PT — 1:1 쿠팡 전문가 코칭",
      alternateName: ["쿠팡 PT", "쿠팡 1:1 코칭", "쿠팡 매출 보장 컨설팅"],
      serviceType: "쿠팡 셀러 1:1 코칭 / 컨설팅",
      provider: { "@id": `${SITE_URL}/#organization` },
      areaServed: { "@type": "Country", name: "대한민국" },
      audience: {
        "@type": "BusinessAudience",
        audienceType: "쿠팡 셀러, 부업 창업자, 초보 쇼핑몰 운영자",
      },
      description:
        "초기비용 0원으로 시작하는 쿠팡 1:1 전문가 코칭. 검증된 전문가가 직접 카테고리·상품·가격·광고를 함께 운영해 3개월 안에 매출을 만듭니다.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW",
        description:
          "초기비용 0원 · 매출 발생 후 순이익의 30% 정산하는 성과 기반 계약",
        url: `${SITE_URL}/pt`,
      },
      url: `${SITE_URL}/pt`,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#megaload`,
      name: "메가로드 (Megaload)",
      alternateName: "쿠팡 메가로드",
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
      provider: { "@id": `${SITE_URL}/#organization` },
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded-lg focus:shadow-lg focus:ring-2 focus:ring-[#E31837]"
        >
          본문으로 건너뛰기
        </a>
        <GlobalErrorCapture />
        {children}
        {/* Google Analytics 4 */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script
              id="ga4-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', { anonymize_ip: true });
                `,
              }}
            />
          </>
        )}
        {/* Naver Analytics (wcs) */}
        {process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID && (
          <>
            <Script
              src="//wcs.naver.net/wcslog.js"
              strategy="afterInteractive"
            />
            <Script
              id="naver-wcs"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  if(!window.wcs_add) window.wcs_add = {};
                  window.wcs_add["wa"] = "${process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID}";
                  if(window.wcs) { wcs_do(); }
                `,
              }}
            />
          </>
        )}
        {/* Kakao Pixel */}
        {process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID && (
          <>
            <Script
              src="//t1.daumcdn.net/kas/static/kp.js"
              strategy="afterInteractive"
            />
            <Script
              id="kakao-pixel"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  kakaoPixel('${process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID}').pageView();
                `,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
