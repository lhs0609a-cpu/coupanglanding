'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrendingKeyword } from '@/lib/supabase/types';
import { TREND_CATEGORIES } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import KeywordAnalysisPanel from '@/components/my/KeywordAnalysisPanel';
import { Flame, TrendingUp, BarChart3, AlertCircle, Calendar, ArrowUpRight, List, ChevronDown, ChevronUp, Search } from 'lucide-react';

type ViewMode = 'ranking' | 'top100';

export default function MyTrendsPage() {
  const [activeTab, setActiveTab] = useState<'recommend' | 'analysis'>('recommend');
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [error, setError] = useState<string | null>(null);
  const [analysisKeyword, setAnalysisKeyword] = useState<string | undefined>(undefined);
  // 뷰 모드: ranking(일간/주간 듀얼) vs top100(검색량 순 전체)
  const [viewMode, setViewMode] = useState<ViewMode>('ranking');
  // 모바일 듀얼 테이블 탭
  const [mobilePanel, setMobilePanel] = useState<'daily' | 'weekly'>('daily');
  // TOP100 정렬
  const [sortField, setSortField] = useState<'totalSearch' | 'product_count' | 'competition_ratio'>('totalSearch');
  const [sortAsc, setSortAsc] = useState(false);
  // TOP100 검색 필터
  const [searchFilter, setSearchFilter] = useState('');

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

  // TOP 100 뷰: 검색량 순 정렬 + 검색 필터
  const top100Keywords = useMemo(() => {
    let filtered = [...keywords];

    // 검색 필터
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      filtered = filtered.filter((kw) => kw.keyword.toLowerCase().includes(q));
    }

    // 정렬
    filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      if (sortField === 'totalSearch') {
        const aData = a.naver_trend_data;
        const bData = b.naver_trend_data;
        aVal = (aData ? (Number(aData.monthlyPcQcCnt) || 0) + (Number(aData.monthlyMobileQcCnt) || 0) : 0);
        bVal = (bData ? (Number(bData.monthlyPcQcCnt) || 0) + (Number(bData.monthlyMobileQcCnt) || 0) : 0);
      } else if (sortField === 'product_count') {
        aVal = a.product_count || 0;
        bVal = b.product_count || 0;
      } else {
        aVal = a.competition_ratio || 0;
        bVal = b.competition_ratio || 0;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [keywords, sortField, sortAsc, searchFilter]);

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
    const pc = Number(kw.naver_trend_data.monthlyPcQcCnt) || 0;
    const mobile = Number(kw.naver_trend_data.monthlyMobileQcCnt) || 0;
    return pc + mobile;
  };

  const getCompetitionColor = (ratio: number) => {
    if (ratio > 5) return 'text-red-600';
    if (ratio > 1) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getCompetitionLabel = (ratio: number) => {
    if (ratio > 5) return '높음';
    if (ratio > 1) return '보통';
    return '낮음';
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

  const handleSort = (field: 'totalSearch' | 'product_count' | 'competition_ratio') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortAsc
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  const categories = ['전체', ...TREND_CATEGORIES];

  const tabs = [
    { key: 'recommend' as const, label: '추천 키워드', icon: Flame },
    { key: 'analysis' as const, label: '키워드 분석', icon: BarChart3 },
  ];

  // 테이블 렌더 함수 (일간/주간)
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

          {/* 뷰 모드 전환 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('ranking')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                viewMode === 'ranking'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              일간/주간 랭킹
            </button>
            <button
              onClick={() => setViewMode('top100')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                viewMode === 'top100'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              검색량 TOP 100
            </button>
            {lastCollectedAt && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
                <Calendar className="w-3.5 h-3.5" />
                {formatCollectedTime(lastCollectedAt)}
              </span>
            )}
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
          ) : viewMode === 'ranking' ? (
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
                      {renderTrendTable(weeklyKeywords, 'rank_weekly')}
                    </div>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            /* TOP 100 뷰 */
            <Card>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <List className="w-5 h-5 text-[#E31837]" />
                    <h2 className="text-lg font-bold text-gray-900">
                      {activeCategory === '전체' ? '전체' : activeCategory} 키워드
                    </h2>
                    <span className="text-sm text-gray-400">({top100Keywords.length}개)</span>
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="키워드 검색..."
                      className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent w-full sm:w-56"
                    />
                  </div>
                </div>

                {top100Keywords.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">{searchFilter ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-center py-2.5 px-2 font-medium text-gray-500 w-12">#</th>
                          <th className="text-left py-2.5 px-2 font-medium text-gray-500">키워드</th>
                          <th className="text-left py-2.5 px-2 font-medium text-gray-500 hidden sm:table-cell">카테고리</th>
                          <th
                            className="text-right py-2.5 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
                            onClick={() => handleSort('totalSearch')}
                          >
                            PC검색<span className="hidden sm:inline">수</span>
                          </th>
                          <th
                            className="text-right py-2.5 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
                          >
                            모바일<span className="hidden sm:inline">검색수</span>
                          </th>
                          <th
                            className="text-right py-2.5 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
                            onClick={() => handleSort('totalSearch')}
                          >
                            총검색<span className="hidden sm:inline">수</span>
                            <SortIcon field="totalSearch" />
                          </th>
                          <th
                            className="text-right py-2.5 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700 hidden md:table-cell select-none"
                            onClick={() => handleSort('product_count')}
                          >
                            상품수
                            <SortIcon field="product_count" />
                          </th>
                          <th
                            className="text-right py-2.5 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700 hidden md:table-cell select-none"
                            onClick={() => handleSort('competition_ratio')}
                          >
                            경쟁강도
                            <SortIcon field="competition_ratio" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {top100Keywords.map((kw, idx) => {
                          const pcSearch = kw.naver_trend_data ? (Number(kw.naver_trend_data.monthlyPcQcCnt) || 0) : 0;
                          const mobileSearch = kw.naver_trend_data ? (Number(kw.naver_trend_data.monthlyMobileQcCnt) || 0) : 0;
                          const totalSearch = pcSearch + mobileSearch;

                          return (
                            <tr
                              key={kw.id}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => handleKeywordClick(kw.keyword)}
                            >
                              <td className="py-2.5 px-2 text-center">
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${getRankBadge(idx + 1)}`}>
                                  {idx + 1}
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
                                <span className="text-xs text-gray-400 sm:hidden">{kw.category}</span>
                              </td>
                              <td className="py-2.5 px-2 hidden sm:table-cell">
                                <Badge label={kw.category} colorClass="bg-blue-100 text-blue-700" />
                              </td>
                              <td className="py-2.5 px-2 text-right text-gray-600">
                                {formatNumber(pcSearch)}
                              </td>
                              <td className="py-2.5 px-2 text-right text-gray-600">
                                {formatNumber(mobileSearch)}
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
                                    <span className="text-xs ml-1 hidden lg:inline">({getCompetitionLabel(kw.competition_ratio)})</span>
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
                )}
              </div>
            </Card>
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
