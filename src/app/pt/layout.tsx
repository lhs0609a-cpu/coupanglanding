import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "쿠팡 PT | 전문가와 함께 3개월 안에 매출 만들기",
  description: "94%가 3개월 안에 매출을 만듭니다. 못 만들면? 0원. 검증된 전문가가 1:1로 쿠팡 매출을 만들어 드립니다.",
  openGraph: {
    title: "쿠팡 PT | 전문가와 함께 3개월 안에 매출 만들기",
    description: "94%가 3개월 안에 매출을 만듭니다. 못 만들면? 0원.",
    type: "website",
    locale: "ko_KR",
    siteName: "쿠팡 셀러허브",
  },
  twitter: {
    card: "summary_large_image",
    title: "쿠팡 PT | 전문가와 함께 3개월 안에 매출 만들기",
    description: "94%가 3개월 안에 매출을 만듭니다. 못 만들면? 0원.",
  },
};

export default function PTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
