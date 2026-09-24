import type { Metadata } from "next";
import Link from "next/link";
import SharedFooter from "@/components/sections/Footer";
import {
  getGroupCounts,
  getKeywordCount,
  getTopKeywords,
  KEYWORDS_PER_PAGE,
} from "@/lib/data/seo-keywords";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 키워드 검색량 허브
 *
 * 75,748개 키워드 문서로 들어가는 입구. 메인 히어로에는 노출하지 않고 푸터 링크로만 잇는다.
 * 크롤러 경로: 푸터 → 이 허브 → 그룹별 목록(페이지당 100개) → 키워드 문서.
 */

export const revalidate = 86400;

const TOTAL = getKeywordCount();

const title = "네이버 키워드 월 검색량 — 상품 키워드 검색량·경쟁도 모음";
const description = `상품 키워드 ${TOTAL.toLocaleString()}개의 네이버 월 검색량과 경쟁 정도를 정리했습니다. 쿠팡에서 팔 때의 카테고리와 판매수수료까지 함께 볼 수 있습니다.`;

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "키워드 검색량",
    "네이버 검색량 조회",
    "상품 키워드",
    "쿠팡 키워드",
    "소싱 키워드",
    "키워드 경쟁도",
  ],
  alternates: {
    canonical: `${SITE_URL}/coupang/keyword`,
    languages: { "ko-KR": `${SITE_URL}/coupang/keyword` },
  },
  openGraph: { title, description, url: `${SITE_URL}/coupang/keyword`, type: "website" },
};

export default function KeywordHub() {
  const groups = getGroupCounts();
  const top = getTopKeywords(60);

  return (
    <main id="main-content" className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-4">
          상품 키워드 월 검색량
        </h1>
        <p className="text-gray-600 leading-relaxed mb-3">
          상품 키워드 <strong className="text-gray-900">{TOTAL.toLocaleString()}개</strong>의 네이버
          월 검색량과 경쟁 정도입니다. 검색량이 월 100회 이상인 키워드만 담았습니다.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed mb-10">
          키워드를 누르면 PC·모바일 검색량 분해, 해당 쿠팡 카테고리의 판매수수료, 판매가별
          실수령액을 볼 수 있습니다. 무엇을 팔지 정할 때 &ldquo;수요가 있는가&rdquo;를 먼저 보라고 만든
          자료입니다.
        </p>

        {/* 그룹 */}
        <section className="mb-12">
          <h2 className="text-lg font-bold text-gray-900 mb-4">상품군 {groups.length}개</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {groups.map((g) => (
              <Link
                key={g.groupId}
                href={`/coupang/keyword/list/${g.groupId}/1`}
                className="rounded-xl border border-gray-200 px-3.5 py-3 hover:border-[#E31837] transition-colors"
              >
                <div className="text-sm font-semibold text-gray-900">{g.group}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {g.count.toLocaleString()}개 · {Math.ceil(g.count / KEYWORDS_PER_PAGE)}쪽
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 검색량 상위 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 mb-1">검색량 상위 60개</h2>
          <p className="text-xs text-gray-500 mb-3">
            검색량이 크다는 건 수요가 크다는 뜻이자 경쟁도 심하다는 뜻입니다. 시작 단계라면 중간
            검색량에서 고르는 편이 유리합니다.
          </p>
          <ul className="flex flex-wrap gap-2">
            {top.map((k) => (
              <li key={k.keyword}>
                <Link
                  href={`/coupang/keyword/${encodeURIComponent(k.keyword)}`}
                  className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] transition-colors"
                >
                  {k.keyword}
                  <span className="text-gray-400 ml-1.5">{k.totalSearch.toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">수요를 확인했다면 그다음은 등록입니다</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            메가로드는 상품을 쿠팡 카테고리에 매칭하고 필수 속성까지 자동으로 채워 등록합니다.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/program"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-[#E31837] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              대량등록 프로그램 보기
            </Link>
            <Link
              href="/coupang/category"
              className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:border-gray-400 transition-colors"
            >
              카테고리별 수수료 보기
            </Link>
          </div>
        </section>
      </div>
      <SharedFooter />
    </main>
  );
}
