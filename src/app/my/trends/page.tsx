'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrendingKeyword } from '@/lib/supabase/types';
import { TREND_CATEGORIES } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import KeywordAnalysisPanel from '@/components/my/KeywordAnalysisPanel';
import { Flame, TrendingUp, BarChart3, AlertCircle, Calendar, ArrowUpRight } from 'lucide-react';

export default function MyTrendsPage() {
  const [activeTab, setActiveTab] = useState<'recommend' | 'analysis'>('recommend');
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [error, setError] = useState<string | null>(null);
  const [analysisKeyword, setAnalysisKeyword] = useState<string | undefined>(undefined);
  // 모바일 듀얼 테이블 탭
  const [mobilePanel, setMobilePanel] = useState<'daily' | 'weekly'>('daily');

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const query = supabase
          .from('trending_keywords')
          .select('*')
          .eq('is_active', true);

        if (activeCategory !== '전체') {
          query.eq('category', activeCategory);
        }

        const { data, error: queryError } = await query;
        if (queryError) {
          setError('키워드를 불러오지 못했습니다.');
        }
        setKeywords((data as TrendingKeyword[]) || []);
      } catch {
        setError('키워드를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, activeCategory]);

  // 일간 순위: rank_daily 기준 (trend_score 기반 급상승)
  const dailyKeywords = useMemo(() => {
    return [...keywords]
      .filter((kw) => kw.rank_daily !== null)
      .sort((a, b) => (a.rank_daily ?? 999) - (b.rank_daily ?? 999));
  }, [keywords]);

  // 주간 순위: rank_weekly 기준 (총 검색량 기반 안정적 인기)
  const weeklyKeywords = useMemo(() => {
    return [...keywords]
      .filter((kw) => kw.rank_weekly !== null)
      .sort((a, b) => (a.rank_weekly ?? 999) - (b.rank_weekly ?? 999));
  }, [keywords]);

  // 수집 시각 (가장 최근)
  const lastCollectedAt = useMemo(() => {
    const dates = keywords
      .map((kw) => kw.collected_at)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  }, [keywords]);

  const formatCollectedTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} 기준`;
  };

  const formatNumber = (n: number) => {
    if (typeof n !== 'number' || n < 0) return '< 10';
    return n.toLocaleString();
  };

  const getTotalSearch = (kw: TrendingKeyword) => {
    if (!kw.naver_trend_data) return 0;
    const pc = kw.naver_trend_data.monthlyPcQcCnt;
    const mobile = kw.naver_trend_data.monthlyMobileQcCnt;
    if (typeof pc !== 'number' || typeof mobile !== 'number') return 0;
    return pc + mobile;
  };

  const getCompetitionColor = (ratio: number) => {
    if (ratio > 5) return 'text-red-600';
    if (ratio > 1) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getRankBadge = (rank: number) => {
    if (rank <= 3) return 'bg-red-100 text-red-700 font-bold';
    if (rank <= 10) return 'bg-orange-100 text-orange-700 font-semibold';
    return 'bg-gray-100 text-gray-600';
  };

  const handleKeywordClick = (keyword: string) => {
    setAnalysisKeyword(keyword);
    setActiveTab('analysis');
  };

  const categories = ['전체', ...TREND_CATEGORIES];

  const tabs = [
    { key: 'recommend' as const, label: '추천 키워드', icon: Flame },
    { key: 'analysis' as const, label: '키워드 분석', icon: BarChart3 },
  ];

  // 테이블 렌더 함수
  const renderTrendTable = (data: TrendingKeyword[], rankField: 'rank_daily' | 'rank_weekly') => {
    if (data.length === 0) {
      return (
        <div className="py-12 text-center text-gray-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">데이터가 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-center py-2.5 px-2 font-medium text-gray-500 w-12">순위</th>
              <th className="text-left py-2.5 px-2 font-medium text-gray-500">키워드</th>
              <th className="text-left py-2.5 px-2 font-medium text-gray-500 hidden sm:table-cell">카테고리</th>
              <th className="text-right py-2.5 px-2 font-medium text-gray-500">검색수</th>
              <th className="text-right py-2.5 px-2 font-medium text-gray-500 hidden md:table-cell">상품수</th>
              <th className="text-right py-2.5 px-2 font-medium text-gray-500 hidden md:table-cell">경쟁강도</th>
            </tr>
          </thead>
          <tbody>
            {data.map((kw) => {
              const rank = rankField === 'rank_daily' ? kw.rank_daily : kw.rank_weekly;
              const totalSearch = getTotalSearch(kw);

              return (
                <tr
                  key={kw.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleKeywordClick(kw.keyword)}
                >
                  <td className="py-2.5 px-2 text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${getRankBadge(rank ?? 999)}`}>
                      {rank}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900 hover:text-[#E31837] transition-colors">
                        {kw.keyword}
                      </span>
                      {kw.trend_score >= 80 && (
                        <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
                      )}
                    </div>
                    {/* 모바일에서 카테고리 표시 */}
                    <span className="text-xs text-gray-400 sm:hidden">{kw.category}</span>
                  </td>
                  <td className="py-2.5 px-2 hidden sm:table-cell">
                    <Badge label={kw.category} colorClass="bg-blue-100 text-blue-700" />
                  </td>
                  <td className="py-2.5 px-2 text-right font-medium text-gray-900">
                    {formatNumber(totalSearch)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-gray-600 hidden md:table-cell">
                    {kw.product_count > 0 ? formatNumber(kw.product_count) : '-'}
                  </td>
                  <td className="py-2.5 px-2 text-right hidden md:table-cell">
                    {kw.competition_ratio > 0 ? (
                      <span className={`font-medium ${getCompetitionColor(kw.competition_ratio)}`}>
                        {kw.competition_ratio.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <FeatureTutorial featureKey="trends" />
      <div>
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">트렌드 키워드</h1>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          일간/주간 트렌드 키워드를 확인하고, 키워드를 클릭하여 상세 분석을 할 수 있습니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-[#E31837] text-[#E31837]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 추천 키워드 탭 */}
      {activeTab === 'recommend' && (
        <>
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

          {/* 에러 배너 */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <Card>
              <div className="py-8 text-center text-gray-400">불러오는 중...</div>
            </Card>
          ) : keywords.length === 0 ? (
            <Card>
              <div className="py-12 text-center text-gray-400">
                <TrendingUp className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                아직 등록된 트렌드 키워드가 없습니다.
              </div>
            </Card>
          ) : (
            <>
              {/* 모바일: 탭 전환 */}
              <div className="flex gap-2 lg:hidden">
                <button
                  onClick={() => setMobilePanel('daily')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                    mobilePanel === 'daily'
                      ? 'bg-[#E31837] text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  일간 트렌드
                </button>
                <button
                  onClick={() => setMobilePanel('weekly')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                    mobilePanel === 'weekly'
                      ? 'bg-[#E31837] text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  주간 트렌드
                </button>
              </div>

              {/* 듀얼 테이블 레이아웃 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 일간 트렌드 */}
                <div className={`${mobilePanel !== 'daily' ? 'hidden lg:block' : ''}`}>
                  <Card>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Flame className="w-5 h-5 text-[#E31837]" />
                          <h2 className="text-lg font-bold text-gray-900">일간 트렌드 키워드</h2>
                        </div>
                      </div>
                      {lastCollectedAt && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatCollectedTime(lastCollectedAt)}
                        </div>
                      )}
                      {renderTrendTable(dailyKeywords, 'rank_daily')}
                    </div>
                  </Card>
                </div>

                {/* 주간 트렌드 */}
                <div className={`${mobilePanel !== 'weekly' ? 'hidden lg:block' : ''}`}>
                  <Card>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-blue-600" />
                          <h2 className="text-lg font-bold text-gray-900">주간 트렌드 키워드</h2>
                        </div>
                      </div>
                      {lastCollectedAt && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatCollectedTime(lastCollectedAt)}
                        </div>
                      )}
                      {renderTrendTable(weeklyKeywords, 'rank_weekly')}
                    </div>
                  </Card>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 키워드 분석 탭 */}
      {activeTab === 'analysis' && (
        <KeywordAnalysisPanel initialKeyword={analysisKeyword} />
      )}
    </div>
  );
}
