'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrendingKeyword } from '@/lib/supabase/types';
import { TREND_CATEGORIES } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Flame } from 'lucide-react';

export default function MyTrendsPage() {
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('전체');

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from('trending_keywords')
        .select('*')
        .eq('is_active', true)
        .order('trend_score', { ascending: false });

      if (activeCategory !== '전체') {
        query = query.eq('category', activeCategory);
      }

      const { data } = await query;
      setKeywords((data as TrendingKeyword[]) || []);
      setLoading(false);
    })();
  }, [supabase, activeCategory]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600';
    if (score >= 50) return 'text-orange-500';
    return 'text-gray-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-400';
    return 'bg-gray-300';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'HOT';
    if (score >= 50) return 'RISING';
    return 'NORMAL';
  };

  const getCompBadgeColor = (compIdx: string) => {
    if (compIdx === '높음') return 'bg-red-100 text-red-700';
    if (compIdx === '중간') return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  const formatNumber = (n: number) => {
    if (typeof n !== 'number' || n < 0) return '< 10';
    return n.toLocaleString();
  };

  const categories = ['전체', ...TREND_CATEGORIES];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Flame className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">트렌드 키워드</h1>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition ${
              activeCategory === cat
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 카드 그리드 */}
      {loading ? (
        <Card>
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        </Card>
      ) : keywords.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-gray-400">
            아직 등록된 트렌드 키워드가 없습니다.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {keywords.map((kw) => (
            <Card key={kw.id}>
              <div className="space-y-3">
                {/* 키워드 & 라벨 */}
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold text-gray-900">{kw.keyword}</h3>
                  <span className={`text-xs font-bold ${getScoreColor(kw.trend_score)}`}>
                    {getScoreLabel(kw.trend_score)}
                  </span>
                </div>

                {/* 카테고리 */}
                <Badge colorClass="bg-blue-100 text-blue-700">{kw.category}</Badge>

                {/* 트렌드 점수 바 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">트렌드 점수</span>
                    <span className={`text-sm font-bold ${getScoreColor(kw.trend_score)}`}>
                      {kw.trend_score}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getScoreBg(kw.trend_score)}`}
                      style={{ width: `${kw.trend_score}%` }}
                    />
                  </div>
                </div>

                {/* 네이버 데이터 */}
                {kw.naver_trend_data && (
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">월간 검색량</span>
                      <span className="font-bold text-gray-900">
                        {formatNumber(
                          kw.naver_trend_data.monthlyPcQcCnt + kw.naver_trend_data.monthlyMobileQcCnt
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">경쟁도</span>
                      <Badge colorClass={getCompBadgeColor(kw.naver_trend_data.compIdx)}>
                        {kw.naver_trend_data.compIdx}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* 관리자 메모 */}
                {kw.memo && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 leading-relaxed">{kw.memo}</p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
