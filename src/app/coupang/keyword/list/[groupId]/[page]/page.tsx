import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SharedFooter from "@/components/sections/Footer";
import {
  getKeywordPage,
  KEYWORD_GROUPS,
  KEYWORDS_PER_PAGE,
} from "@/lib/data/seo-keywords";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 키워드 목록 (상품군별 · 페이지당 100개)
 *
 * 75,748개 문서에 크롤러가 도달하는 경로다. 허브 → 이 목록 → 키워드 문서.
 * 파라미터는 숫자만 쓴다 — 이 레포는 Google Drive 경로라 프리렌더 산출물에 한글
 * 디렉터리가 생기면 EPERM 으로 빌드가 잠긴다.
 */

export const revalidate = 86400;
export const dynamicParams = true;

/** 각 상품군의 1쪽만 미리 만든다. 나머지 쪽은 첫 요청 때 생성 */
export function generateStaticParams() {
  return KEYWORD_GROUPS.map((_, groupId) => ({ groupId: String(groupId), page: "1" }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string; page: string }>;
}): Promise<Metadata> {
  const { groupId, page } = await params;
  const data = getKeywordPage(Number(groupId), Number(page));
  if (!data) return { title: "목록을 찾을 수 없습니다" };

  const pageNo = Number(page);
  const title =
    pageNo === 1
      ? `${data.group} 상품 키워드 검색량 모음`
      : `${data.group} 상품 키워드 검색량 모음 (${pageNo}쪽)`;
  const description =
    `${data.group} 상품 키워드의 네이버 월 검색량입니다. ` +
    `${pageNo}쪽 / 전체 ${data.totalPages}쪽. 키워드별 PC·모바일 검색량과 쿠팡 판매수수료를 볼 수 있습니다.`;

  const url = `${SITE_URL}/coupang/keyword/list/${groupId}/${page}`;
  return {
    title,
    description: description.slice(0, 155),
    alternates: { canonical: url, languages: { "ko-KR": url } },
    openGraph: { title, description: description.slice(0, 155), url, type: "website" },
  };
}

export default async function KeywordListPage({
  params,
}: {
  params: Promise<{ groupId: string; page: string }>;
}) {
  const { groupId, page } = await params;
  const gid = Number(groupId);
  const pageNo = Number(page);
  const data = getKeywordPage(gid, pageNo);
  if (!data) notFound();

  const start = (pageNo - 1) * KEYWORDS_PER_PAGE;

  // 앞뒤 5쪽씩만 노출한다 — 수백 개 링크를 한 화면에 깔면 링크 가치가 흩어진다
  const from = Math.max(1, pageNo - 5);
  const to = Math.min(data.totalPages, pageNo + 5);
  const pageNumbers: number[] = [];
  for (let p = from; p <= to; p++) pageNumbers.push(p);

  return (
    <main id="main-content" className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <nav aria-label="경로" className="mb-6 text-xs text-gray-500">
          <Link href="/coupang/keyword" className="hover:text-gray-900">
            키워드 검색량
          </Link>
          <span className="mx-1.5 text-gray-300">›</span>
          <span className="text-gray-900 font-medium">{data.group}</span>
        </nav>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-3">
          {data.group} 상품 키워드 검색량
          {pageNo > 1 && <span className="text-gray-400 font-bold"> ({pageNo}쪽)</span>}
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          검색량 많은 순 · {pageNo}쪽 / 전체 {data.totalPages}쪽
        </p>

        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700 w-14">#</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">키워드</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700 w-32">
                  월 검색량
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((k, i) => (
                <tr key={k.keyword}>
                  <td className="border border-gray-200 px-3 py-2 text-gray-400">{start + i + 1}</td>
                  <td className="border border-gray-200 px-3 py-2">
                    <Link
                      href={`/coupang/keyword/${encodeURIComponent(k.keyword)}`}
                      className="text-gray-800 hover:text-[#E31837] hover:underline"
                    >
                      {k.keyword}
                    </Link>
                  </td>
                  <td className="border border-gray-200 px-3 py-2 font-semibold text-gray-900">
                    {k.totalSearch.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지 이동 */}
        <nav aria-label="쪽 이동" className="flex flex-wrap items-center gap-1.5 mb-10">
          {pageNo > 1 && (
            <Link
              href={`/coupang/keyword/list/${gid}/${pageNo - 1}`}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-400"
            >
              이전
            </Link>
          )}
          {from > 1 && (
            <Link
              href={`/coupang/keyword/list/${gid}/1`}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-400"
            >
              1
            </Link>
          )}
          {from > 2 && <span className="px-1 text-gray-400">…</span>}
          {pageNumbers.map((p) => (
            <Link
              key={p}
              href={`/coupang/keyword/list/${gid}/${p}`}
              aria-current={p === pageNo ? "page" : undefined}
              className={
                p === pageNo
                  ? "px-3 py-1.5 rounded-lg bg-[#E31837] text-white text-sm font-semibold"
                  : "px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-400"
              }
            >
              {p}
            </Link>
          ))}
          {to < data.totalPages - 1 && <span className="px-1 text-gray-400">…</span>}
          {to < data.totalPages && (
            <Link
              href={`/coupang/keyword/list/${gid}/${data.totalPages}`}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-400"
            >
              {data.totalPages}
            </Link>
          )}
          {pageNo < data.totalPages && (
            <Link
              href={`/coupang/keyword/list/${gid}/${pageNo + 1}`}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-400"
            >
              다음
            </Link>
          )}
        </nav>

        {/* 다른 상품군 */}
        <section>
          <h2 className="text-sm font-bold text-gray-900 mb-3">다른 상품군</h2>
          <ul className="flex flex-wrap gap-2">
            {KEYWORD_GROUPS.map((g, i) =>
              i === gid ? null : (
                <li key={g}>
                  <Link
                    href={`/coupang/keyword/list/${i}/1`}
                    className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] transition-colors"
                  >
                    {g}
                  </Link>
                </li>
              )
            )}
          </ul>
        </section>
      </div>
      <SharedFooter />
    </main>
  );
}
