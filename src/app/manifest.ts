import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "쿠팡PT · 메가로드",
    short_name: "쿠팡PT",
    description:
      "쿠팡PT 1:1 전문가 코칭과 AI 기반 쿠팡 상품 등록 자동화 프로그램 메가로드",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#E31837",
    lang: "ko-KR",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
