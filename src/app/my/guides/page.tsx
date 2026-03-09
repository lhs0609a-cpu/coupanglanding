'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Clock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import {
  GUIDE_CATEGORIES,
  GUIDE_ARTICLES,
  getArticlesByCategory,
  searchArticles,
} from '@/lib/data/guides';

export default function GuidesHubPage() {
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => searchArticles(query), [query]);
  const isSearching = query.trim().length > 0;

  const sortedCategories = useMemo(
    () => [...GUIDE_CATEGORIES].sort((a, b) => a.order - b.order),
    [],
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <FeatureTutorial featureKey="guides" />
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">운영 가이드</h1>
        <p className="text-sm text-gray-500 mt-1">
          쿠팡 셀러 운영에 필요한 모든 지식을 한 곳에서 확인하세요
        </p>
      </div>

      {/* 검색바 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="가이드 검색 (예: 송장, 반품, 지재권...)"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
        />
      </div>

      {/* 검색 결과 */}
      {isSearching ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            검색 결과 <span className="font-bold text-gray-900">{searchResults.length}</span>건
          </p>
          {searchResults.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-4">
                검색 결과가 없습니다. 다른 키워드로 시도해보세요.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((article) => (
                <GuideCard key={article.articleId} article={article} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 카테고리별 섹션 */
        <div className="space-y-8">
          {sortedCategories.map((category) => {
            const articles = getArticlesByCategory(category.categoryId);
            if (articles.length === 0) return null;
            return (
              <section key={category.categoryId}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{category.icon}</span>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{category.title}</h2>
                    <p className="text-xs text-gray-500">{category.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {articles.map((article) => (
                    <GuideCard key={article.articleId} article={article} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuideCard({ article }: { article: (typeof GUIDE_ARTICLES)[number] }) {
  return (
    <Link href={`/my/guides/${article.categoryId}/${article.articleId}`}>
      <Card className="hover:shadow-md hover:border-gray-300 transition cursor-pointer h-full">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <span className="text-2xl">{article.icon}</span>
            <Badge
              label={article.estimatedTime}
              colorClass="bg-gray-100 text-gray-600"
            />
          </div>
          <h3 className="text-sm font-bold text-gray-900">{article.title}</h3>
          <p className="text-xs text-gray-500 line-clamp-2">{article.subtitle}</p>
        </div>
      </Card>
    </Link>
  );
}
