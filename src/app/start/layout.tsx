import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "쿠팡 셀러 시작 로드맵 | 사업자등록부터 입점까지 4단계",
  description:
    "쿠팡 판매를 처음 시작하는 왕초보 셀러를 위한 단계별 가이드. 사업자등록 → 통신판매업 → 건기식 → 쿠팡 윙 입점까지 체크리스트로 따라하세요.",
  openGraph: {
    title: "쿠팡 셀러 시작 로드맵 | 4단계로 끝내는 입점 준비",
    description:
      "사업자등록부터 쿠팡 윙 입점까지, 왕초보도 따라할 수 있는 단계별 체크리스트.",
    type: "website",
    locale: "ko_KR",
    siteName: "쿠팡 메가로드",
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
