import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SharedFooter from "@/components/sections/Footer";
import { commissionTable, getCategory } from "@/lib/data/coupang-categories";
import { getKeyword, getRelatedKeywords } from "@/lib/data/seo-keywords";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 키워드별 판매 수요 문서 (75,748개)
 *
 * ── 페이지마다 무엇이 다른가 ──
 * 네이버 실검색량(PC/모바일 분해), 경쟁도, 이 키워드가 속한 쿠팡 카테고리의 판매수수료율,
 * 그 수수료로 계산한 판매가별 실수령액. 전부 키워드마다 다른 실데이터다.
 *
 * ⚠️ 프리렌더하지 않는다(generateStaticParams 없음).
 *    1) 75,748개를 빌드에서 만들면 빌드가 끝나지 않는다.
 *    2) 이 레포는 Google Drive 경로라 한글 디렉터리 산출물이 EPERM 으로 빌드를 잠근다.
 *       키워드가 한글이므로 프리렌더하는 순간 그 문제를 정통으로 맞는다.
 *    첫 요청 때 생성되어 revalidate 주기만큼 캐시된다.
 */

export const revalidate = 86400;
export const dynamicParams = true;

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kw: string }>;
}): Promise<Metadata> {
  const { kw } = await params;
  const keyword = decodeURIComponent(kw);
  const d = getKeyword(keyword);
  if (!d) return { title: "키워드를 찾을 수 없습니다" };

  const title = `${d.keyword} 쿠팡 판매 — 월 검색량 ${d.totalSearch.toLocaleString()}, 경쟁 ${d.competition}`;
  const description =
    `${d.keyword} 네이버 월 검색량은 ${d.totalSearch.toLocaleString()}회입니다. ` +
    `모바일 ${pct(d.mobileSearch, d.totalSearch)}%, 경쟁 정도 ${d.competition}. ` +
    (d.coupangCommissionRate !== null
      ? `쿠팡 판매수수료 ${d.coupangCommissionRate}% 기준 실수령액까지 정리했습니다.`
      : `쿠팡에서 팔 때 참고할 수요 지표를 정리했습니다.`);

  const url = `${SITE_URL}/coupang/keyword/${encodeURIComponent(d.keyword)}`;
  return {
    title,
    description: description.slice(0, 155),
    keywords: [
      d.keyword,
      `${d.keyword} 검색량`,
      `${d.keyword} 판매`,
      `${d.keyword} 쿠팡`,
      `${d.keyword} 도매`,
      "쿠팡 키워드 분석",
      "상품 소싱 키워드",
    ],
    alternates: { canonical: url, languages: { "ko-KR": url } },
    openGraph: { title, description: description.slice(0, 155), url, type: "article" },
  };
}

export default async function KeywordPage({ params }: { params: Promise<{ kw: string }> }) {
  const { kw } = await params;
  const keyword = decodeURIComponent(kw);
  const d = getKeyword(keyword);
  if (!d) notFound();

  const category = d.coupangCategoryId ? getCategory(d.coupangCategoryId) : null;
  const related = getRelatedKeywords(d.keyword, d.seed);
  const mobileShare = pct(d.mobileSearch, d.totalSearch);
  const url = `${SITE_URL}/coupang/keyword/${encodeURIComponent(d.keyword)}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "키워드 검색량", item: `${SITE_URL}/coupang/keyword` },
      { "@type": "ListItem", position: 2, name: d.seedCategory },
      { "@type": "ListItem", position: 3, name: d.keyword, item: url },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <main id="main-content" className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <nav aria-label="경로" className="mb-6 text-xs text-gray-500">
            <Link href="/coupang/keyword" className="hover:text-gray-900">
              키워드 검색량
            </Link>
            <span className="mx-1.5 text-gray-300">›</span>
            <span>{d.seedCategory}</span>
            <span className="mx-1.5 text-gray-300">›</span>
            <span className="text-gray-900 font-medium">{d.keyword}</span>
          </nav>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-4">
            {d.keyword} — 월 검색량 {d.totalSearch.toLocaleString()}회
          </h1>

          <p className="text-gray-600 leading-relaxed mb-8">
            네이버에서 <strong className="text-gray-900">{d.keyword}</strong>는 한 달에{" "}
            <strong className="text-gray-900">{d.totalSearch.toLocaleString()}회</strong> 검색됩니다.
            이 중 모바일이 <strong className="text-gray-900">{mobileShare}%</strong>이고, 광고 경쟁
            정도는 <strong className="text-gray-900">{d.competition}</strong>입니다.
          </p>

          {/* 검색량 분해 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-3">검색량 분해</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">구분</th>
                    <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">월 검색량</th>
                    <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">비중</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 text-gray-800">모바일</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-900 font-semibold">
                      {d.mobileSearch.toLocaleString()}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-500">{mobileShare}%</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2 text-gray-800">PC</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-900 font-semibold">
                      {d.pcSearch.toLocaleString()}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-500">
                      {pct(d.pcSearch, d.totalSearch)}%
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 font-semibold text-gray-900">합계</td>
                    <td className="border border-gray-200 px-3 py-2 font-extrabold text-gray-900">
                      {d.totalSearch.toLocaleString()}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-500">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500 leading-relaxed">
              네이버 검색광고 키워드도구 기준 월간 검색수입니다. 모바일 비중이 높은 키워드는 상품
              대표이미지와 제목 앞부분이 성과를 크게 가릅니다.
            </p>
          </section>

          {/* 쿠팡 카테고리 연결 */}
          {category ? (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-gray-900 mb-3">쿠팡에서 팔 때 — 카테고리와 수수료</h2>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                이 키워드는 쿠팡{" "}
                <Link
                  href={`/coupang/category/${category.id}`}
                  className="text-[#E31837] hover:underline font-semibold"
                >
                  {category.pathParts.join(" › ")}
                </Link>{" "}
                카테고리에 해당합니다. 판매수수료는{" "}
                <strong className="text-gray-900">{category.commissionRate}%</strong>이고, 등록 시
                반드시 입력해야 하는 속성은 {category.requiredAttributeCount}개입니다.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">판매가</th>
                      <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">
                        판매수수료 ({category.commissionRate}%)
                      </th>
                      <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">
                        수수료 차감 후
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionTable(category.commissionRate).map((row) => (
                      <tr key={row.price}>
                        <td className="border border-gray-200 px-3 py-2 text-gray-800">
                          {row.price.toLocaleString()}원
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-[#E31837]">
                          −{row.fee.toLocaleString()}원
                        </td>
                        <td className="border border-gray-200 px-3 py-2 font-semibold text-gray-900">
                          {row.net.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                판매수수료만 반영한 값입니다. 실제 정산액은 여기서 결제수수료가 추가로 차감됩니다.
              </p>
            </section>
          ) : (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-gray-900 mb-3">쿠팡에서 팔 때</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                이 키워드는 쿠팡 카테고리에 자동으로 연결되지 않았습니다. 상품 성격에 따라 카테고리가
                갈리는 경우입니다. 카테고리별 판매수수료와 필수 속성은{" "}
                <Link href="/coupang/category" className="text-[#E31837] hover:underline">
                  쿠팡 카테고리별 수수료 목록
                </Link>
                에서 확인하세요.
              </p>
            </section>
          )}

          {/* 연관 키워드 */}
          {related.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                연관 키워드 ({related.length}개)
              </h2>
              {/*
                시드 단어는 화면에 쓰지 않는다. 문자열 포함으로 뽑은 값이라
                '룰루레몬 → 레몬' 같은 오매칭이 약 10% 남아 있고, 그걸 그대로 적으면
                눈에 보이는 거짓말이 된다. 그룹핑 용도로만 쓴다.
                (네이버 쇼핑 검색 API 가 등록되면 상품수로 걸러낸 뒤 다시 노출해도 된다)
              */}
              <p className="text-sm text-gray-500 mb-3">
                이 키워드와 함께 검색되는 키워드입니다. 옆 숫자는 월 검색량입니다.
              </p>
              <ul className="flex flex-wrap gap-2">
                {related.map((r) => (
                  <li key={r.keyword}>
                    <Link
                      href={`/coupang/keyword/${encodeURIComponent(r.keyword)}`}
                      className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] transition-colors"
                    >
                      {r.keyword}
                      <span className="text-gray-400 ml-1.5">{r.totalSearch.toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">
              이 키워드로 팔 상품을 찾고 계신가요?
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              메가로드는 도매 상품을 찾아 쿠팡 카테고리를 매칭하고 상품명·옵션·가격까지 자동으로
              채워 등록합니다. 검색량이 있는 키워드를 골라 빠르게 시험해 보는 방식으로 씁니다.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/program"
                className="inline-flex items-center px-4 py-2 rounded-xl bg-[#E31837] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                대량등록 프로그램 보기
              </Link>
              <Link
                href="/coupang/keyword"
                className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:border-gray-400 transition-colors"
              >
                다른 키워드 검색량 보기
              </Link>
            </div>
          </section>
        </div>
        <SharedFooter />
      </main>
    </>
  );
}
