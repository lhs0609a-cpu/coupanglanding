import type { Metadata } from 'next';
import Link from 'next/link';
import SharedFooter from '@/components/sections/Footer';
import MarginCalculator, { type PickerCategory } from '@/components/coupang/MarginCalculator';
import { getCategoriesByDepth, getCategory } from '@/lib/data/coupang-categories';

const SITE_URL = 'https://www.megaload.co.kr';

/**
 * 쿠팡 마진 계산기
 *
 * ── 왜 도구인가 ──
 * "마진율계산기" 월 3,030 · "마진계산기" 월 2,040 인데 둘 다 경쟁이 낮다(네이버 키워드도구 실측).
 * 일반 마진계산기와 다른 점은 하나다 — **수수료율을 사용자가 몰라도 된다.**
 * 우리는 쿠팡 카테고리 16,259개의 실제 판매수수료율을 가지고 있어서, 카테고리만 고르면 채워진다.
 *
 * ?cat={catId} 로 들어오면 그 카테고리로 미리 채운다. 카테고리 문서 11,657개에서
 * "이 카테고리로 계산" 링크가 여기로 들어온다 — 내부 링크가 양방향으로 붙는다.
 */

export const revalidate = 86400;

const title = '쿠팡 마진 계산기 — 카테고리 수수료까지 자동 반영';
const description =
  '판매가와 원가를 넣으면 쿠팡 판매수수료·결제수수료를 빼고 실제 남는 순이익과 마진율을 계산합니다. 카테고리를 고르면 실제 수수료율이 자동으로 들어갑니다.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    '마진 계산기',
    '마진율 계산기',
    '쿠팡 마진 계산',
    '쿠팡 수수료 계산기',
    '판매 마진',
    '순이익 계산',
    '손익분기 판매가',
    '쿠팡 정산 계산',
  ],
  alternates: {
    canonical: `${SITE_URL}/coupang/margin-calculator`,
    languages: { 'ko-KR': `${SITE_URL}/coupang/margin-calculator` },
  },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/coupang/margin-calculator`,
    type: 'website',
  },
};

export default async function MarginCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;

  // 픽커에는 중분류(3depth) 495개만 보낸다. 16,259개를 전부 브라우저로 보낼 이유가 없고,
  // 더 깊은 카테고리는 카테고리 문서에서 ?cat= 으로 들어온다.
  const categories: PickerCategory[] = getCategoriesByDepth(3, true).map((c) => ({
    id: c.id,
    name: c.name,
    rate: c.commissionRate,
    topLevel: c.topLevel,
  }));

  const picked = cat ? getCategory(cat) : null;
  const initial = picked
    ? {
        id: picked.id,
        name: picked.name,
        path: picked.pathParts.join(' › '),
        rate: picked.commissionRate,
      }
    : null;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '쿠팡 마진율은 어떻게 계산하나요?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '판매가에서 판매수수료와 결제수수료를 빼 정산액을 구하고, 거기서 매입가·배송비·기타비를 뺀 것이 순이익입니다. 마진율은 순이익을 판매가로 나눈 값입니다.',
        },
      },
      {
        '@type': 'Question',
        name: '쿠팡 판매수수료는 몇 퍼센트인가요?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '카테고리마다 다릅니다. 대체로 4%에서 10.9% 사이이며, 같은 상품이라도 어느 카테고리에 등록하느냐에 따라 달라집니다. 이 계산기에서 카테고리를 고르면 실제 수수료율이 자동으로 들어갑니다.',
        },
      },
      {
        '@type': 'Question',
        name: '손익분기 판매가는 무엇인가요?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '순이익이 0이 되는 판매가입니다. 수수료는 판매가에 비례해 붙지만 원가는 고정이므로, 가격을 내리다 보면 역전되는 지점이 생깁니다. 그 지점이 손익분기 판매가입니다.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <main id="main-content" className="min-h-screen bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <nav aria-label="경로" className="mb-6 text-xs text-gray-500">
            <Link href="/coupang/category" className="hover:text-gray-900">
              쿠팡 카테고리
            </Link>
            <span className="mx-1.5 text-gray-300">›</span>
            <span className="text-gray-900 font-medium">마진 계산기</span>
          </nav>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-4">
            쿠팡 마진 계산기
          </h1>
          <p className="text-gray-600 leading-relaxed mb-2">
            판매가와 원가를 넣으면 수수료를 뺀 <strong className="text-gray-900">실제 남는 돈</strong>을
            계산합니다. 대부분의 마진계산기는 수수료율을 직접 넣어야 하는데, 정작 그 값을 모르는 게
            문제입니다.
          </p>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            여기서는 <strong className="text-gray-700">카테고리만 고르면 실제 판매수수료율이 들어갑니다.</strong>{' '}
            쿠팡 카테고리 16,259개의 수수료 데이터를 그대로 씁니다.
            {initial && (
              <>
                {' '}
                지금은 <strong className="text-gray-900">{initial.path}</strong> 카테고리
                (판매수수료 {initial.rate}%)로 채워져 있습니다.
              </>
            )}
          </p>

          <MarginCalculator categories={categories} initial={initial} />

          {/* ── 본문: 도구만 있고 설명이 없으면 검색엔진이 평가할 내용이 없다 ── */}
          <section className="mt-14 max-w-3xl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">마진율과 원가 대비 수익률은 다릅니다</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              같은 상품을 두고도 두 숫자가 크게 다르게 나옵니다. 마진율은 순이익을 판매가로 나눈 값이고,
              원가 대비 수익률은 순이익을 내가 쓴 돈으로 나눈 값입니다.
            </p>
            <p className="text-gray-600 leading-relaxed mb-3">
              판매가 20,000원, 원가 10,000원, 순이익 3,000원이라면 마진율은 15%지만 원가 대비 수익률은
              30%입니다. 얼마를 투입해 얼마를 벌었는지 볼 때는 뒤쪽이 더 정확합니다. 위 계산기는 둘 다
              보여줍니다.
            </p>

            <h2 className="text-lg font-bold text-gray-900 mt-9 mb-3">계산에 넣지 않은 것</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              이 계산기는 건당 기준입니다. 실제 월 수익은 여기서 더 빠집니다.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-gray-600 text-sm leading-relaxed">
              <li>
                <strong className="text-gray-800">반품·교환</strong> — 왕복 배송비가 순이익 몇 건을 한 번에
                지웁니다. 반품률이 높은 카테고리는 마진을 더 두껍게 잡아야 합니다.
              </li>
              <li>
                <strong className="text-gray-800">광고비</strong> — 광고를 쓴다면 순이익에서 광고비를 또
                빼야 합니다. 남는 돈이 광고비보다 적으면 팔수록 손해입니다.
              </li>
              <li>
                <strong className="text-gray-800">쿠폰·할인</strong> — 판매가를 낮추면 수수료도 줄지만 원가는
                그대로라 순이익이 더 빠르게 줄어듭니다.
              </li>
              <li>
                <strong className="text-gray-800">세금</strong> — 부가세와 종합소득세는 별도입니다.
              </li>
            </ul>

            <h2 className="text-lg font-bold text-gray-900 mt-9 mb-3">수수료율은 어디서 온 값인가</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-gray-600 text-sm leading-relaxed">
              <li>
                <strong className="text-gray-800">판매수수료</strong> — 쿠팡 카테고리별 실데이터입니다.
                카테고리에 따라 4%에서 10.9%까지 달라집니다.
              </li>
              <li>
                <strong className="text-gray-800">결제수수료 2.9%</strong> — 쿠팡 정산 구조의 공개된 근사값입니다.
                실제 값은 결제수단에 따라 달라질 수 있어 고칠 수 있게 두었습니다.
              </li>
              <li>
                <strong className="text-gray-800">로켓그로스 12.9%</strong> — 공개된 근사값이며 상품 크기·무게에
                따라 달라집니다.
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3 text-sm">
              근사값 두 개는 모두 입력 필드로 열어 두었습니다. 본인 정산 내역의 실제 비율을 넣으면 더 정확해집니다.
            </p>
          </section>

          <section className="mt-12 rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 max-w-3xl">
            <h2 className="text-base font-bold text-gray-900 mb-2">
              마진이 남는 카테고리를 찾고 계신가요?
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              수수료는 카테고리가 정합니다. 같은 상품이라도 어느 카테고리에 올리느냐에 따라 남는 돈이
              달라집니다. 카테고리별 수수료와 등록 필수속성을 전부 정리해 두었습니다.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/coupang/category"
                className="inline-flex items-center px-4 py-2 rounded-xl bg-[#E31837] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                카테고리별 수수료 보기
              </Link>
              <Link
                href="/guide/margin-calculation"
                className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:border-gray-400 transition-colors"
              >
                마진 계산 가이드
              </Link>
              <Link
                href="/coupang/keyword"
                className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:border-gray-400 transition-colors"
              >
                키워드 검색량 보기
              </Link>
            </div>
          </section>
        </div>
        <SharedFooter />
      </main>
    </>
  );
}
