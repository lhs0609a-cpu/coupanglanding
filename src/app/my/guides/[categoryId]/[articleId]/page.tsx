'use client';

import { use } from 'react';
import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import GuideBreadcrumb from '@/components/guides/GuideBreadcrumb';
import GuideStepSection from '@/components/guides/GuideStepSection';
import GuideFAQSection from '@/components/guides/GuideFAQSection';
import {
  getArticleById,
  getCategoryById,
  getRelatedArticles,
} from '@/lib/data/guides';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ categoryId: string; articleId: string }>;
}

export default function GuideArticlePage({ params }: PageProps) {
  const { categoryId, articleId } = use(params);
  const article = getArticleById(articleId);
  const category = getCategoryById(categoryId);

  if (!article || !category || article.categoryId !== categoryId) {
    notFound();
  }

  const relatedArticles = getRelatedArticles(articleId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 브레드크럼 */}
      <GuideBreadcrumb
        items={[
          { label: '운영 가이드', href: '/my/guides' },
          { label: category.title, href: '/my/guides' },
          { label: article.title },
        ]}
      />

      {/* 헤더 카드 */}
      <Card>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl">{article.icon}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{article.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{article.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">{article.estimatedTime}</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{article.overview}</p>
        </div>
      </Card>

      {/* 스텝 섹션 */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">단계별 가이드</h2>
        <GuideStepSection steps={article.steps} articleId={articleId} />
      </div>

      {/* FAQ */}
      {article.faqs.length > 0 && (
        <Card>
          <GuideFAQSection faqs={article.faqs} />
        </Card>
      )}

      {/* 관련 가이드 */}
      {relatedArticles.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3">관련 가이드</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {relatedArticles.map((related) => (
              <Link
                key={related.articleId}
                href={`/my/guides/${related.categoryId}/${related.articleId}`}
              >
                <Card className="hover:shadow-md hover:border-gray-300 transition cursor-pointer h-full">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{related.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-gray-900">{related.title}</h4>
                      <p className="text-xs text-gray-500 truncate">{related.subtitle}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
