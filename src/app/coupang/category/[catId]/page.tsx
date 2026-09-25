import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SharedFooter from "@/components/sections/Footer";
import {
  commissionTable,
  getCategory,
  getChildren,
  getSiblings,
  getCategoriesByDepth,
  isIndexable,
} from "@/lib/data/coupang-categories";

const SITE_URL = "https://www.megaload.co.kr";

/**
 * 쿠팡 카테고리별 수수료·필수속성 문서 (16,259개)
 *
 * ── 왜 이 페이지가 스팸이 아닌가 ──
 * 페이지마다 값이 다르다. 판매수수료율(카테고리별 4~10.8%), 등록 시 반드시 채워야 하는
 * 구매옵션·상세속성 목록, 실수령액 표가 전부 이 카테고리의 실데이터다.
 * 검색해도 한 곳에 정리된 데가 없는 정보라 "쿠팡 ○○ 수수료" 롱테일에 실제로 답이 된다.
 *
 * ⚠️ 여기서 지켜야 하는 선
 * 1) 없는 값은 만들지 않는다. 결제수수료·정산주기는 카테고리별 확정값이 없으므로 쓰지 않는다.
 * 2) 숨김 텍스트를 넣지 않는다. 메인 내비에 노출하지 않는 것과 텍스트를 숨기는 것은 다르다.
 *    전자는 정상이고 후자는 색인 삭제 사유다.
 * 3) catId 는 숫자만 쓴다. 이 레포는 Google Drive 경로라 프리렌더 산출물에 한글 디렉터리가
 *    생기면 EPERM 으로 빌드가 잠긴다.
 */

/** 하루 한 번 재생성 — 카테고리 데이터는 자주 바뀌지 않는다 */
export const revalidate = 86400;
/** 빌드에서 만들지 않은 카테고리는 첫 요청 때 생성 후 캐시 */
export const dynamicParams = true;

/**
 * 빌드 시에는 3depth(495개)만 미리 만든다.
 * 16,259개를 전부 프리렌더하면 빌드가 수십 분으로 늘어나고, 나머지는 어차피
 * 첫 요청 때 생성되어 캐시된다.
 */
export function generateStaticParams() {
  return getCategoriesByDepth(3).map((c) => ({ catId: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ catId: string }>;
}): Promise<Metadata> {
  const { catId } = await params;
  const c = getCategory(catId);
  if (!c) return { title: "카테고리를 찾을 수 없습니다" };

  const requiredCount =
    c.purchaseOptions.filter((a) => a.required).length +
    c.detailAttributes.filter((a) => a.required).length;

  const title = `쿠팡 ${c.name} 카테고리 판매수수료 ${c.commissionRate}% — 등록 필수속성 정리`;
  const description =
    `쿠팡 ${c.pathParts.join(" > ")} 카테고리의 판매수수료는 ${c.commissionRate}%입니다. ` +
    `상품 등록 시 반드시 입력해야 하는 속성 ${requiredCount}개와 전체 속성 목록, ` +
    `판매가별 실수령액을 정리했습니다.`;

  const url = `${SITE_URL}/coupang/category/${c.id}`;
  return {
    title,
    description: description.slice(0, 155),
    keywords: [
      `쿠팡 ${c.name}`,
      `쿠팡 ${c.name} 수수료`,
      `${c.name} 판매수수료`,
      `쿠팡 ${c.name} 등록`,
      `${c.name} 필수속성`,
      `쿠팡 ${c.topLevel} 수수료`,
      "쿠팡 카테고리 수수료",
      "쿠팡 상품등록",
    ],
    alternates: { canonical: url, languages: { "ko-KR": url } },
    openGraph: { title, description: description.slice(0, 155), url, type: "article" },
    // 색인 가치가 없는 묶음(도서>외국도서)은 페이지는 살려 두되 색인만 막는다.
    // follow 는 남겨 둬야 이 페이지에 걸린 내부 링크가 끊기지 않는다.
    ...(isIndexable(c) ? {} : { robots: { index: false, follow: true } }),
  };
}

function AttributeTable({
  rows,
  emptyText,
}: {
  rows: { name: string; required: boolean; unit?: string }[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">속성명</th>
            <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700 w-24">필수 여부</th>
            <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700 w-20">단위</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.name}>
              <td className="border border-gray-200 px-3 py-2 text-gray-800">{a.name}</td>
              <td className="border border-gray-200 px-3 py-2">
                {a.required ? (
                  <span className="text-[#E31837] font-semibold">필수</span>
                ) : (
                  <span className="text-gray-400">선택</span>
                )}
              </td>
              <td className="border border-gray-200 px-3 py-2 text-gray-500">{a.unit ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CoupangCategoryPage({
  params,
}: {
  params: Promise<{ catId: string }>;
}) {
  const { catId } = await params;
  const c = getCategory(catId);
  if (!c) notFound();

  const requiredOptions = c.purchaseOptions.filter((a) => a.required);
  const requiredDetails = c.detailAttributes.filter((a) => a.required);
  const requiredCount = requiredOptions.length + requiredDetails.length;
  const totalCount = c.purchaseOptions.length + c.detailAttributes.length;

  const children = getChildren(c);
  const siblings = children.length > 0 ? [] : getSiblings(c);
  const table = commissionTable(c.commissionRate);
  const url = `${SITE_URL}/coupang/category/${c.id}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "쿠팡 카테고리",
        item: `${SITE_URL}/coupang/category`,
      },
      ...c.pathParts.map((part, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: part,
        ...(i === c.pathParts.length - 1 ? { item: url } : {}),
      })),
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `쿠팡 ${c.name} 카테고리 판매수수료는 몇 퍼센트인가요?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${c.commissionRate}%입니다. 판매가 10,000원 기준 판매수수료 ${table[0].fee.toLocaleString()}원이 차감됩니다. 이와 별도로 결제수수료가 부과됩니다.`,
        },
      },
      {
        "@type": "Question",
        name: `쿠팡 ${c.name} 등록할 때 꼭 입력해야 하는 항목은 무엇인가요?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            requiredCount > 0
              ? `필수 항목은 ${requiredCount}개입니다: ${[...requiredOptions, ...requiredDetails]
                  .map((a) => a.name)
                  .join(", ")}.`
              : "이 카테고리는 필수로 지정된 속성이 없습니다. 다만 선택 속성을 채울수록 검색 필터에 노출될 확률이 올라갑니다.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <main id="main-content" className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          {/* Breadcrumb */}
          <nav aria-label="카테고리 경로" className="mb-6 text-xs text-gray-500">
            <Link href="/coupang/category" className="hover:text-gray-900">
              쿠팡 카테고리
            </Link>
            {c.pathParts.map((part, i) => (
              <span key={`${part}-${i}`}>
                <span className="mx-1.5 text-gray-300">›</span>
                <span className={i === c.pathParts.length - 1 ? "text-gray-900 font-medium" : ""}>
                  {part}
                </span>
              </span>
            ))}
          </nav>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-4">
            쿠팡 {c.name} 카테고리 — 판매수수료 {c.commissionRate}%
          </h1>

          <p className="text-gray-600 leading-relaxed mb-8">
            {c.pathParts.join(" › ")} 카테고리입니다. 이 카테고리의 쿠팡 판매수수료는{" "}
            <strong className="text-gray-900">{c.commissionRate}%</strong>이고, 상품 등록 화면에서
            다루는 속성은 모두 {totalCount}개, 그중 반드시 입력해야 하는 항목은{" "}
            <strong className="text-gray-900">{requiredCount}개</strong>입니다.
          </p>

          {/* 수수료 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-3">판매가별 판매수수료와 실수령액</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">판매가</th>
                    <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">
                      판매수수료 ({c.commissionRate}%)
                    </th>
                    <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-700">
                      수수료 차감 후
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row) => (
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
            <p className="mt-3">
              <Link
                href={`/coupang/margin-calculator?cat=${c.id}`}
                className="inline-flex items-center px-3.5 py-2 rounded-xl border border-[#E31837] text-[#E31837] text-sm font-semibold hover:bg-[#E31837] hover:text-white transition-colors"
              >
                이 카테고리로 마진 계산하기
              </Link>
            </p>
            <p className="mt-3 text-xs text-gray-500 leading-relaxed">
              위 금액은 <strong>판매수수료만</strong> 반영한 값입니다. 실제 정산액은 여기서 결제수수료가
              추가로 차감되고, 쿠팡 정산 주기(주정산·월정산)에 따라 입금 시점이 나뉩니다. 정산 구조는{" "}
              <Link href="/guide/channel/coupang" className="text-[#E31837] hover:underline">
                쿠팡 입점·정산 가이드
              </Link>
              에 정리해 두었습니다.
            </p>
          </section>

          {/* 구매옵션 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              구매옵션 ({c.purchaseOptions.length}개)
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              구매자가 상품을 고를 때 선택하는 값입니다. 필수 항목이 비어 있으면 등록이 반려됩니다.
            </p>
            <AttributeTable
              rows={c.purchaseOptions}
              emptyText="이 카테고리는 지정된 구매옵션이 없습니다."
            />
          </section>

          {/* 상세속성 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              상세 속성 ({c.detailAttributes.length}개)
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              검색 필터와 상세 정보에 쓰이는 값입니다. 필수가 아니더라도 채울수록 필터 노출 기회가 늘어납니다.
            </p>
            <AttributeTable
              rows={c.detailAttributes}
              emptyText="이 카테고리는 지정된 상세 속성이 없습니다."
            />
          </section>

          {/* 하위 / 형제 카테고리 — 내부 링크 */}
          {children.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-gray-900 mb-3">
                하위 카테고리 ({children.length}개)
              </h2>
              <ul className="flex flex-wrap gap-2">
                {children.map((ch) => (
                  <li key={ch.id}>
                    <Link
                      href={`/coupang/category/${ch.id}`}
                      className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] transition-colors"
                    >
                      {ch.name}
                      <span className="text-gray-400 ml-1.5">{ch.commissionRate}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {siblings.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-gray-900 mb-3">같은 상위 분류의 다른 카테고리</h2>
              <ul className="flex flex-wrap gap-2">
                {siblings.map((sb) => (
                  <li key={sb.id}>
                    <Link
                      href={`/coupang/category/${sb.id}`}
                      className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] transition-colors"
                    >
                      {sb.name}
                      <span className="text-gray-400 ml-1.5">{sb.commissionRate}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* CTA */}
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">
              이 카테고리 속성 {totalCount}개를 매번 손으로 채우고 계신가요?
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              메가로드는 상품을 올리면 AI가 카테고리를 매칭하고 이 속성들을 자동으로 채웁니다.
              필수 항목 누락으로 인한 등록 반려를 줄이려고 만든 기능입니다.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/program"
                className="inline-flex items-center px-4 py-2 rounded-xl bg-[#E31837] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                대량등록 프로그램 보기
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:border-gray-400 transition-colors"
              >
                초보 셀러 가이드
              </Link>
            </div>
          </section>
        </div>
        <SharedFooter />
      </main>
    </>
  );
}
