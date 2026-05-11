import type { Metadata } from "next";

const SITE_URL = "https://megaload.co.kr";

export const metadata: Metadata = {
  title: "쿠팡 셀러 시작 로드맵 | 사업자등록부터 입점까지 4단계",
  description:
    "쿠팡 판매를 처음 시작하는 왕초보 셀러를 위한 단계별 가이드. 사업자등록 → 통신판매업 → 건기식 → 쿠팡 윙 입점까지 체크리스트로 따라하세요.",
  keywords: [
    "쿠팡 입점",
    "쿠팡 사업자등록",
    "쿠팡 윙 입점",
    "통신판매업 신고",
    "쿠팡 셀러 시작",
    "쿠팡 창업",
    "쿠팡 입점 절차",
    "쿠팡PT",
    "쿠팡 판매 시작",
  ],
  alternates: { canonical: "/start" },
  openGraph: {
    title: "쿠팡 셀러 시작 로드맵 | 4단계로 끝내는 입점 준비",
    description:
      "사업자등록부터 쿠팡 윙 입점까지, 왕초보도 따라할 수 있는 단계별 체크리스트.",
    type: "article",
    locale: "ko_KR",
    url: `${SITE_URL}/start`,
    siteName: "쿠팡PT · 메가로드",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 셀러 시작 로드맵 | 4단계로 끝내는 입점 준비",
    description:
      "사업자등록부터 쿠팡 윙 입점까지, 왕초보도 따라할 수 있는 단계별 체크리스트.",
  },
};

export default function StartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
