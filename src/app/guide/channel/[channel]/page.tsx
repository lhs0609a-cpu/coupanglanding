import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHANNEL_ONBOARDING_GUIDES } from '@/lib/data/channel-onboarding-guides';
import { CHANNEL_SETUP_GUIDES } from '@/lib/data/channel-setup-guides';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';

const SITE_URL = 'https://megaload.co.kr';

/**
 * 채널별 입점·API 연동 공개 가이드 (검색 유입용 + 실제 셀러 도움)
 *
 * 이 콘텐츠는 원래 로그인 뒤 마법사 모달 안에만 있어서 검색엔진이 볼 수 없었다.
 * 같은 데이터를 공개 문서로 렌더해 "11번가 입점 방법", "롯데온 API 발급" 같은
 * 롱테일 검색어에 실제 가치 있는 문서로 대응한다.
 *
 * ⚠️ 숨김 텍스트·키워드 스터핑은 쓰지 않는다. Google 스팸 정책의 "숨겨진 텍스트 및
 *    링크"에 걸려 수동 조치(색인 삭제) 대상이 되고, 네이버도 저품질 문서로 분류한다.
 *    노출은 실제로 읽히는 문서로만 만든다.
 */

/** 셀프 입점이 가능한 채널만 공개한다 (준비중 채널은 내용이 얇아 저품질 문서가 된다) */
const PUBLIC_CHANNELS = (Object.keys(CHANNEL_ONBOARDING_GUIDES) as Channel[])
  .filter((c) => CHANNEL_ONBOARDING_GUIDES[c]?.available);

export function generateStaticParams() {
  return PUBLIC_CHANNELS.map((channel) => ({ channel }));
}

function getGuides(channel: string) {
  if (!PUBLIC_CHANNELS.includes(channel as Channel)) return null;
  const c = channel as Channel;
  return { onboarding: CHANNEL_ONBOARDING_GUIDES[c], setup: CHANNEL_SETUP_GUIDES[c], label: CHANNEL_LABELS[c] };
}

export async function generateMetadata({ params }: { params: Promise<{ channel: string }> }): Promise<Metadata> {
  const { channel } = await params;
  const g = getGuides(channel);
  if (!g) return { title: '가이드를 찾을 수 없습니다' };

  const title = `${g.label} 입점 방법 + API 연동 가이드 (${g.onboarding.estimatedTime})`;
  const description =
    `${g.label} 판매자 가입부터 API 키 발급까지 단계별로 정리했습니다. ` +
    `${g.onboarding.eligibility} · 준비물: ${g.onboarding.documents.slice(0, 3).join(', ')} · ${g.onboarding.settlementSummary}`;

  return {
    title,
    description: description.slice(0, 155),
    keywords: [
      `${g.label} 입점`,
      `${g.label} 입점 방법`,
      `${g.label} 판매자 가입`,
      `${g.label} 셀러 가입`,
      `${g.label} API`,
      `${g.label} API 키 발급`,
      `${g.label} 수수료`,
      `${g.label} 정산`,
      '오픈마켓 입점',
      '멀티채널 판매',
    ],
    alternates: { canonical: `/guide/channel/${channel}` },
    openGraph: {
      title,
      description: description.slice(0, 155),
      type: 'article',
      locale: 'ko_KR',
      url: `${SITE_URL}/guide/channel/${channel}`,
      siteName: '쿠팡PT · 메가로드',
    },
  };
}

export default async function ChannelGuidePage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const g = getGuides(channel);
  if (!g) notFound();

  const { onboarding, setup, label } = g;

  // 구조화 데이터: HowTo(입점 절차) + BreadcrumbList
  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `${label} 입점 방법`,
    description: onboarding.headline,
    totalTime: onboarding.estimatedTime,
    supply: onboarding.documents.map((d) => ({ '@type': 'HowToSupply', name: d })),
    step: onboarding.steps.map((s) => ({
      '@type': 'HowToStep',
      position: s.stepNumber,
      name: s.title,
      text: s.detailedInstructions.join(' '),
      ...(s.url ? { url: s.url } : {}),
      ...(s.imageUrl ? { image: `${SITE_URL}${s.imageUrl}` } : {}),
    })),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '가이드', item: `${SITE_URL}/guide` },
      { '@type': 'ListItem', position: 3, name: `${label} 입점`, item: `${SITE_URL}/guide/channel/${channel}` },
    ],
  };

  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <nav className="text-xs text-gray-500 mb-4">
        <Link href="/" className="hover:underline">홈</Link>
        <span className="mx-1.5">›</span>
        <Link href="/guide" className="hover:underline">가이드</Link>
        <span className="mx-1.5">›</span>
        <span className="text-gray-700">{label} 입점</span>
      </nav>

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug">
        {label} 입점 방법과 API 연동 가이드
      </h1>
      <p className="mt-3 text-gray-600">{onboarding.headline}</p>

      {/* 요약 카드 — 검색 결과에서 바로 답이 되는 정보 */}
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="p-3 bg-gray-50 rounded-lg">
          <dt className="text-xs text-gray-500">입점 대상</dt>
          <dd className="mt-0.5 text-gray-900">{onboarding.eligibility}</dd>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <dt className="text-xs text-gray-500">소요 기간</dt>
          <dd className="mt-0.5 text-gray-900">{onboarding.estimatedTime}</dd>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <dt className="text-xs text-gray-500">비용</dt>
          <dd className="mt-0.5 text-gray-900">{onboarding.cost}</dd>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <dt className="text-xs text-gray-500">정산 · 수수료</dt>
          <dd className="mt-0.5 text-gray-900">{onboarding.settlementSummary}</dd>
        </div>
      </dl>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-gray-900">준비물</h2>
        <ul className="mt-2 space-y-1">
          {onboarding.documents.map((d) => (
            <li key={d} className="text-sm text-gray-700">· {d}</li>
          ))}
        </ul>
      </section>

      {/* ── 1부: 입점(판매자 가입) ── */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-gray-900">
          {label} 판매자 회원가입 단계별 방법
        </h2>
        <ol className="mt-5 space-y-8">
          {onboarding.steps.map((s) => (
            <li key={s.stepNumber} id={`step-${s.stepNumber}`}>
              <h3 className="font-bold text-gray-900">
                {s.stepNumber}. {s.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600">{s.description}</p>
              {s.imageUrl && (
                <figure className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.imageUrl}
                    alt={`${label} ${s.title} 화면`}
                    loading="lazy"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50"
                  />
                  {s.imageSource && (
                    <figcaption className="mt-1 text-[11px] text-gray-400">출처: {s.imageSource}</figcaption>
                  )}
                </figure>
              )}
              <ul className="mt-3 space-y-1.5">
                {s.detailedInstructions.map((inst, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed">— {inst}</li>
                ))}
              </ul>
              {s.tip && (
                <p className="mt-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-2.5">💡 {s.tip}</p>
              )}
              {s.warning && (
                <p className="mt-2 text-sm text-red-700 bg-red-50 rounded-lg p-2.5">⚠️ {s.warning}</p>
              )}
              {s.url && (
                <p className="mt-2 text-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {s.url} ↗
                  </a>
                </p>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-gray-600 bg-amber-50 rounded-lg p-3">{onboarding.finalNote}</p>
      </section>

      {/* ── 2부: API 연동 ── */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900">{setup.title}</h2>
        <p className="mt-1 text-sm text-gray-500">예상 소요 {setup.estimatedTime}</p>

        <h3 className="mt-4 font-bold text-gray-900">사전 준비</h3>
        <ul className="mt-2 space-y-1">
          {setup.prerequisites.map((p) => (
            <li key={p} className="text-sm text-gray-700">· {p}</li>
          ))}
        </ul>

        <ol className="mt-5 space-y-8">
          {setup.steps.map((s) => (
            <li key={s.stepNumber} id={`api-step-${s.stepNumber}`}>
              <h3 className="font-bold text-gray-900">
                {s.stepNumber}. {s.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600">{s.description}</p>
              {s.imageUrl && (
                <figure className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.imageUrl}
                    alt={`${label} ${s.title} 화면`}
                    loading="lazy"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50"
                  />
                  {s.imageSource && (
                    <figcaption className="mt-1 text-[11px] text-gray-400">출처: {s.imageSource}</figcaption>
                  )}
                </figure>
              )}
              <ul className="mt-3 space-y-1.5">
                {s.detailedInstructions.map((inst, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed">— {inst}</li>
                ))}
              </ul>
              {s.tip && (
                <p className="mt-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-2.5">💡 {s.tip}</p>
              )}
              {s.warning && (
                <p className="mt-2 text-sm text-red-700 bg-red-50 rounded-lg p-2.5">⚠️ {s.warning}</p>
              )}
              {s.url && (
                <p className="mt-2 text-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {s.url} ↗
                  </a>
                </p>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-gray-600 bg-amber-50 rounded-lg p-3">{setup.finalNote}</p>
      </section>

      {/* 내부 링크 — 다른 채널 가이드 */}
      <section className="mt-12 pt-8 border-t border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">다른 채널 입점 가이드</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PUBLIC_CHANNELS.filter((c) => c !== channel).map((c) => (
            <li key={c}>
              <Link
                href={`/guide/channel/${c}`}
                className="inline-block px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {CHANNEL_LABELS[c]} 입점 방법
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 p-5 bg-gray-900 rounded-xl text-center">
        <p className="text-white font-bold">한 번 등록하면 {PUBLIC_CHANNELS.length}개 채널에 자동으로</p>
        <p className="mt-1 text-sm text-gray-300">
          채널마다 따로 올리지 않아도 됩니다. 쿠팡에 등록하면 나머지 채널로 자동 복제됩니다.
        </p>
        <Link
          href="/program"
          className="inline-block mt-4 px-5 py-2.5 bg-white text-gray-900 text-sm font-bold rounded-lg"
        >
          메가로드 알아보기
        </Link>
      </section>
    </main>
  );
}
