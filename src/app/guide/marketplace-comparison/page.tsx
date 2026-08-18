import type { Metadata } from 'next';
import Link from 'next/link';
import { CHANNEL_ONBOARDING_GUIDES } from '@/lib/data/channel-onboarding-guides';
import { CHANNEL_SETUP_GUIDES } from '@/lib/data/channel-setup-guides';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';

const SITE_URL = 'https://megaload.co.kr';

/**
 * 오픈마켓 7곳 입점 조건 비교 (공개 문서)
 *
 * 채널별 가이드에 흩어져 있는 수수료·정산·서류·소요기간을 한 표로 모은다.
 * 개별 채널 페이지가 "어떻게 하나"라면 이 페이지는 "어디부터 하나"에 답한다 —
 * 검색 의도가 다르므로 중복 문서가 아니다.
 *
 * ⚠️ 숫자는 전부 CHANNEL_ONBOARDING_GUIDES 의 실데이터에서 온다. 여기서 따로 쓰지 않는다.
 *    한 곳만 고치면 표·개별 페이지·마법사가 같이 갱신되도록.
 */

const PUBLIC_CHANNELS = (Object.keys(CHANNEL_ONBOARDING_GUIDES) as Channel[])
  .filter((c) => CHANNEL_ONBOARDING_GUIDES[c]?.available);

export const metadata: Metadata = {
  title: '오픈마켓 입점 조건 비교 — 수수료·정산·서류·소요기간 총정리',
  description:
    '쿠팡·네이버 스마트스토어·11번가·G마켓·옥션·롯데온·테무 7개 오픈마켓의 입점 조건을 한 표로 비교했습니다. 판매수수료, 정산 주기, 필요 서류, 심사 기간, API 연동 난이도까지.',
  keywords: [
    '오픈마켓 비교',
    '오픈마켓 수수료',
    '오픈마켓 수수료 비교',
    '오픈마켓 입점',
    '오픈마켓 정산',
    '쿠팡 네이버 수수료 비교',
    '11번가 수수료',
    '지마켓 수수료',
    '롯데온 수수료',
    '오픈마켓 추천',
    '셀러 입점',
    '부업 오픈마켓',
  ],
  alternates: { canonical: '/guide/marketplace-comparison' },
  openGraph: {
    title: '오픈마켓 7곳 입점 조건 비교 (수수료·정산·서류)',
    description: '어디부터 시작할지 정하는 표. 수수료, 정산 주기, 필요 서류, 심사 기간을 한눈에.',
    type: 'article',
    locale: 'ko_KR',
    url: `${SITE_URL}/guide/marketplace-comparison`,
    siteName: '쿠팡PT · 메가로드',
  },
};

export default function MarketplaceComparisonPage() {
  const rows = PUBLIC_CHANNELS.map((c) => ({
    channel: c,
    label: CHANNEL_LABELS[c],
    g: CHANNEL_ONBOARDING_GUIDES[c],
    setup: CHANNEL_SETUP_GUIDES[c],
  }));

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '가이드', item: `${SITE_URL}/guide` },
      { '@type': 'ListItem', position: 3, name: '오픈마켓 비교', item: `${SITE_URL}/guide/marketplace-comparison` },
    ],
  };

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '오픈마켓 입점 조건 비교',
    itemListElement: rows.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${r.label} 입점`,
      url: `${SITE_URL}/guide/channel/${r.channel}`,
    })),
  };

  return (
    <main className="max-w-4xl mx-auto px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />

      <nav className="text-xs text-gray-500 mb-4">
        <Link href="/" className="hover:underline">홈</Link>
        <span className="mx-1.5">›</span>
        <Link href="/guide" className="hover:underline">가이드</Link>
        <span className="mx-1.5">›</span>
        <span className="text-gray-700">오픈마켓 비교</span>
      </nav>

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug">
        오픈마켓 {rows.length}곳 입점 조건 비교
      </h1>
      <p className="mt-3 text-gray-600 leading-relaxed">
        어디부터 시작할지 정할 때 필요한 숫자만 모았습니다. 수수료·정산 주기·필요 서류·심사 기간은
        마켓마다 크게 다르고, 처음 한 곳을 잘못 고르면 서류를 다시 준비해야 하는 경우도 생깁니다.
        각 항목은 해당 마켓 공식 셀러센터 기준이며, 자세한 절차는 마켓 이름을 눌러 확인하세요.
      </p>

      {/* 요약 표 */}
      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">오픈마켓별 입점 대상·소요 기간·비용·정산 조건 비교표</caption>
          <thead>
            <tr className="bg-gray-50 text-left">
              <th scope="col" className="p-3 font-semibold text-gray-900 whitespace-nowrap">마켓</th>
              <th scope="col" className="p-3 font-semibold text-gray-900 whitespace-nowrap">입점 대상</th>
              <th scope="col" className="p-3 font-semibold text-gray-900 whitespace-nowrap">소요 기간</th>
              <th scope="col" className="p-3 font-semibold text-gray-900 whitespace-nowrap">비용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-t border-gray-100 align-top">
                <th scope="row" className="p-3 font-medium text-left whitespace-nowrap">
                  <Link href={`/guide/channel/${r.channel}`} className="text-blue-600 hover:underline">
                    {r.label}
                  </Link>
                </th>
                <td className="p-3 text-gray-700">{r.g.eligibility}</td>
                <td className="p-3 text-gray-700">{r.g.estimatedTime}</td>
                <td className="p-3 text-gray-700">{r.g.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 정산·수수료 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900">마켓별 정산 주기와 판매수수료</h2>
        <p className="mt-2 text-gray-600">
          같은 상품을 같은 가격에 팔아도 손에 들어오는 돈과 들어오는 시점이 다릅니다.
          현금 흐름이 빠듯하다면 수수료율보다 정산 주기를 먼저 보세요.
        </p>
        <dl className="mt-5 space-y-4">
          {rows.map((r) => (
            <div key={r.channel} className="p-4 rounded-lg border border-gray-200">
              <dt className="font-bold text-gray-900">
                <Link href={`/guide/channel/${r.channel}`} className="hover:underline">{r.label}</Link>
              </dt>
              <dd className="mt-1 text-sm text-gray-700 leading-relaxed">{r.g.settlementSummary}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 필요 서류 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900">마켓별 필요 서류</h2>
        <p className="mt-2 text-gray-600">
          공통으로 쓰이는 서류가 많습니다. 사업자등록증·통신판매업신고증·통장사본을 한 번에 준비해두면
          여러 마켓을 연달아 입점할 때 다시 떼러 다니지 않아도 됩니다.
        </p>
        <div className="mt-5 space-y-4">
          {rows.map((r) => (
            <div key={r.channel} className="p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-900">{r.label}</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {r.g.documents.map((d) => (
                  <li key={d} className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md">{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* API 연동 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900">마켓별 API 연동 조건</h2>
        <p className="mt-2 text-gray-600">
          상품을 자동으로 올리려면 각 마켓의 오픈API 키가 필요합니다. 발급 방식과 사전 조건이 마켓마다 다릅니다.
        </p>
        <div className="mt-5 space-y-4">
          {rows.map((r) => (
            <div key={r.channel} className="p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-900">
                <Link href={`/guide/channel/${r.channel}#api-step-1`} className="hover:underline">
                  {r.setup.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-gray-500">예상 소요 {r.setup.estimatedTime} · {r.setup.steps.length}단계</p>
              <ul className="mt-2 space-y-1">
                {r.setup.prerequisites.map((p) => (
                  <li key={p} className="text-sm text-gray-700">· {p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 pt-8 border-t border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">채널별 상세 가이드</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {rows.map((r) => (
            <li key={r.channel}>
              <Link
                href={`/guide/channel/${r.channel}`}
                className="inline-block px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {r.label} 입점 방법
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 p-5 bg-gray-900 rounded-xl text-center">
        <p className="text-white font-bold">여러 마켓에 같은 상품을 올리는 게 일이라면</p>
        <p className="mt-1 text-sm text-gray-300">
          쿠팡에 한 번 등록하면 나머지 채널로 자동 복제됩니다. 채널마다 다시 입력하지 않아도 됩니다.
        </p>
        <Link href="/program" className="inline-block mt-4 px-5 py-2.5 bg-white text-gray-900 text-sm font-bold rounded-lg">
          메가로드 알아보기
        </Link>
      </section>
    </main>
  );
}
