import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDE_ARTICLES, getArticle } from '@/lib/data/guide-articles';

const SITE_URL = 'https://megaload.co.kr';

/**
 * 가이드 아티클 렌더러 — /guide/{slug}
 *
 * 글은 전부 guide-articles.ts 에 데이터로 있고 여기서 한 번만 렌더한다.
 * 글을 늘릴 때 페이지 파일을 만들지 않아도 되고, 구조화 데이터·내부 링크·sitemap 이
 * 자동으로 따라온다.
 *
 * 라우팅: 같은 depth 의 정적 경로(/guide/marketplace-comparison)가 우선하므로 충돌 없음.
 */

export function generateStaticParams() {
  return GUIDE_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return { title: '문서를 찾을 수 없습니다' };

  return {
    title: a.title,
    description: a.description,
    keywords: a.keywords,
    alternates: { canonical: `/guide/${a.slug}` },
    openGraph: {
      title: a.title,
      description: a.description,
      type: 'article',
      locale: 'ko_KR',
      url: `${SITE_URL}/guide/${a.slug}`,
      siteName: '쿠팡PT · 메가로드',
      publishedTime: a.published,
      modifiedTime: a.updated,
    },
  };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.published,
    dateModified: a.updated,
    inLanguage: 'ko-KR',
    author: { '@type': 'Organization', name: '메가로드' },
    publisher: { '@type': 'Organization', name: '메가로드', url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/guide/${a.slug}` },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '가이드', item: `${SITE_URL}/guide` },
      { '@type': 'ListItem', position: 3, name: a.title, item: `${SITE_URL}/guide/${a.slug}` },
    ],
  };

  const faqLd = a.faq?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: a.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }
    : null;

  const related = (a.related ?? [])
    .map((s) => getArticle(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <main className="max-w-3xl mx-auto px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {faqLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      )}

      <nav className="text-xs text-gray-500 mb-4">
        <Link href="/" className="hover:underline">홈</Link>
        <span className="mx-1.5">›</span>
        <Link href="/guide" className="hover:underline">가이드</Link>
        <span className="mx-1.5">›</span>
        <span className="text-gray-700">{a.title}</span>
      </nav>

      <article>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug">{a.title}</h1>
        <p className="mt-2 text-xs text-gray-400">
          <time dateTime={a.updated}>{a.updated} 수정</time>
        </p>
        <p className="mt-4 text-gray-700 leading-relaxed">{a.lead}</p>

        {/* 목차 — 긴 문서에서 체류시간과 이동성을 함께 올린다 */}
        <nav aria-label="목차" className="mt-8 p-4 rounded-xl bg-gray-50">
          <h2 className="text-sm font-bold text-gray-900">목차</h2>
          <ol className="mt-2 space-y-1">
            {a.sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#section-${i + 1}`} className="text-sm text-blue-600 hover:underline">
                  {i + 1}. {s.heading}
                </a>
              </li>
            ))}
            {a.faq?.length ? (
              <li>
                <a href="#faq" className="text-sm text-blue-600 hover:underline">
                  {a.sections.length + 1}. 자주 묻는 질문
                </a>
              </li>
            ) : null}
          </ol>
        </nav>

        {a.sections.map((s, i) => (
          <section key={s.heading} id={`section-${i + 1}`} className="mt-10 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900">{s.heading}</h2>
            {s.body.map((p, j) => (
              <p key={j} className="mt-3 text-gray-700 leading-relaxed">{p}</p>
            ))}

            {s.list && (
              <ul className="mt-4 space-y-2">
                {s.list.map((li, j) => (
                  <li key={j} className="text-gray-700 leading-relaxed pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-gray-400">
                    {li}
                  </li>
                ))}
              </ul>
            )}

            {s.table && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {s.table.headers.map((h) => (
                        <th key={h} scope="col" className="p-3 font-semibold text-gray-900">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-100">
                        {row.map((cell, ci) => (
                          <td key={ci} className="p-3 text-gray-700 align-top">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {s.callout && (
              <p
                className={`mt-4 p-3 rounded-lg text-sm leading-relaxed ${
                  s.callout.kind === 'warn'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-blue-50 text-blue-800'
                }`}
              >
                {s.callout.kind === 'warn' ? '⚠️ ' : '💡 '}
                {s.callout.text}
              </p>
            )}
          </section>
        ))}

        {a.faq?.length ? (
          <section id="faq" className="mt-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900">자주 묻는 질문</h2>
            <dl className="mt-4 space-y-5">
              {a.faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-bold text-gray-900">{f.q}</dt>
                  <dd className="mt-1.5 text-gray-700 leading-relaxed">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </article>

      {related.length > 0 && (
        <section className="mt-12 pt-8 border-t border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">함께 읽으면 좋은 문서</h2>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/guide/${r.slug}`} className="text-blue-600 hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900">마켓별 입점 가이드</h2>
        <p className="mt-2 text-sm text-gray-600">
          마켓마다 수수료·정산 주기·필요 서류가 다릅니다. 한 표로 비교해보세요.
        </p>
        <Link
          href="/guide/marketplace-comparison"
          className="inline-block mt-3 px-4 py-2 text-sm font-medium text-gray-900 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          오픈마켓 입점 조건 비교 →
        </Link>
      </section>

      <section className="mt-10 p-5 bg-gray-900 rounded-xl text-center">
        <p className="text-white font-bold">상품 등록에 시간을 다 쓰고 있다면</p>
        <p className="mt-1 text-sm text-gray-300">
          쿠팡에 한 번 등록하면 나머지 채널로 자동 복제됩니다.
        </p>
        <Link href="/program" className="inline-block mt-4 px-5 py-2.5 bg-white text-gray-900 text-sm font-bold rounded-lg">
          메가로드 알아보기
        </Link>
      </section>
    </main>
  );
}
