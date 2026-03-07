'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrendingKeyword } from '@/lib/supabase/types';
import { TREND_CATEGORIES, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import KeywordAnalysisPanel from '@/components/my/KeywordAnalysisPanel';
import { Flame, Search, TrendingUp, ShoppingCart, Lightbulb, Calendar, CheckCircle2, XCircle, ChevronRight, BarChart3, AlertCircle } from 'lucide-react';

const SEASON_ICONS: Record<string, string> = {
  '연중': '📅',
  '봄': '🌸',
  '여름': '☀️',
  '가을': '🍂',
  '겨울': '❄️',
  '봄/여름': '🌸☀️',
  '가을/겨울': '🍂❄️',
  '명절/시즌': '🎁',
};

export default function MyTrendsPage() {
  const [activeTab, setActiveTab] = useState<'recommend' | 'analysis'>('recommend');
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [selectedKeyword, setSelectedKeyword] = useState<TrendingKeyword | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisKeyword, setAnalysisKeyword] = useState<string | undefined>(undefined);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('trending_keywords')
          .select('*')
          .eq('is_active', true)
          .order('trend_score', { ascending: false });

        if (activeCategory !== '전체') {
          query = query.eq('category', activeCategory);
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

  const getTotalSearch = (kw: TrendingKeyword) => {
    if (!kw.naver_trend_data) return null;
    const pc = kw.naver_trend_data.monthlyPcQcCnt;
    const mobile = kw.naver_trend_data.monthlyMobileQcCnt;
    if (typeof pc !== 'number' || typeof mobile !== 'number') return null;
    return pc + mobile;
  };

  const categories = ['전체', ...TREND_CATEGORIES];

  const tabs = [
    { key: 'recommend' as const, label: '추천 키워드', icon: Flame },
    { key: 'analysis' as const, label: '키워드 분석', icon: BarChart3 },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">트렌드 키워드</h1>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          추천 키워드를 확인하거나, 직접 키워드를 검색하여 트렌드를 분석할 수 있습니다.
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

          {/* 카드 그리드 */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {keywords.map((kw) => {
                const totalSearch = getTotalSearch(kw);
                return (
                  <div
                    key={kw.id}
                    onClick={() => setSelectedKeyword(kw)}
                    className="cursor-pointer group"
                  >
                    <Card>
                      <div className="space-y-3">
                        {/* 키워드 & 라벨 */}
                        <div className="flex items-start justify-between">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#E31837] transition-colors">
                            {kw.keyword}
                          </h3>
                          <span className={`text-xs font-bold ${getScoreColor(kw.trend_score)}`}>
                            {getScoreLabel(kw.trend_score)}
                          </span>
                        </div>

                        {/* 배지 행: 카테고리 + 시즌 + 난이도 */}
                        <div className="flex flex-wrap gap-1.5">
                          <Badge label={kw.category} colorClass="bg-blue-100 text-blue-700" />
                          {kw.seasonality && kw.seasonality !== '연중' && (
                            <Badge
                              label={`${SEASON_ICONS[kw.seasonality] || ''} ${kw.seasonality}`}
                              colorClass="bg-purple-100 text-purple-700"
                            />
                          )}
                          {kw.difficulty && (
                            <Badge
                              label={DIFFICULTY_LABELS[kw.difficulty] || kw.difficulty}
                              colorClass={DIFFICULTY_COLORS[kw.difficulty] || 'bg-gray-100 text-gray-600'}
                            />
                          )}
                        </div>

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

                        {/* 검색량 + 경쟁도 + 마진 */}
                        <div className="pt-2 border-t border-gray-100 space-y-1.5">
                          {totalSearch !== null && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">월간 검색량</span>
                              <span className="font-bold text-gray-900">{formatNumber(totalSearch)}</span>
                            </div>
                          )}
                          {kw.naver_trend_data?.compIdx && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">경쟁강도</span>
                              <Badge label={kw.naver_trend_data.compIdx} colorClass={getCompBadgeColor(kw.naver_trend_data.compIdx)} />
                            </div>
                          )}
                          {kw.margin_range && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">예상 마진</span>
                              <span className="font-semibold text-green-600">{kw.margin_range}</span>
                            </div>
                          )}
                        </div>

                        {/* 상세보기 유도 */}
                        <div className="flex items-center justify-end text-xs text-gray-400 group-hover:text-[#E31837] transition-colors pt-1">
                          상세 분석 보기 <ChevronRight className="w-3 h-3 ml-0.5" />
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}

          {/* 상세 분석 모달 */}
          {selectedKeyword && (
            <Modal
              isOpen={!!selectedKeyword}
              onClose={() => setSelectedKeyword(null)}
              title={`${selectedKeyword.keyword} — 상세 분석`}
            >
              <KeywordDetailModal
                kw={selectedKeyword}
                onClose={() => setSelectedKeyword(null)}
                onAnalyze={(kw) => {
                  setSelectedKeyword(null);
                  setAnalysisKeyword(kw);
                  setActiveTab('analysis');
                }}
              />
            </Modal>
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

function KeywordDetailModal({ kw, onClose, onAnalyze }: { kw: TrendingKeyword; onClose: () => void; onAnalyze: (keyword: string) => void }) {
  const formatNumber = (n: number) => {
    if (typeof n !== 'number' || n < 0) return '< 10';
    return n.toLocaleString();
  };

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

  const getCompBadgeColor = (compIdx: string) => {
    if (compIdx === '높음') return 'bg-red-100 text-red-700';
    if (compIdx === '중간') return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  const nd = kw.naver_trend_data;
  const pros = Array.isArray(kw.pros) ? kw.pros : [];
  const cons = Array.isArray(kw.cons) ? kw.cons : [];
  const relatedKws = Array.isArray(kw.related_keywords) ? kw.related_keywords : [];

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      {/* ① 키워드 분석 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-gray-900">키워드 분석</h3>
        </div>
        {nd ? (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">PC 월간 검색수</span>
                <p className="font-bold text-gray-900">{formatNumber(nd.monthlyPcQcCnt)}</p>
              </div>
              <div>
                <span className="text-gray-500">모바일 월간 검색수</span>
                <p className="font-bold text-gray-900">{formatNumber(nd.monthlyMobileQcCnt)}</p>
              </div>
              <div>
                <span className="text-gray-500">PC 평균 클릭수</span>
                <p className="font-bold text-gray-900">{formatNumber(nd.monthlyAvePcClkCnt)}</p>
              </div>
              <div>
                <span className="text-gray-500">모바일 평균 클릭수</span>
                <p className="font-bold text-gray-900">{formatNumber(nd.monthlyAveMobileClkCnt)}</p>
              </div>
              <div>
                <span className="text-gray-500">경쟁강도</span>
                <div className="mt-0.5">
                  <Badge label={nd.compIdx} colorClass={getCompBadgeColor(nd.compIdx)} />
                </div>
              </div>
              <div>
                <span className="text-gray-500">평균 노출 순위</span>
                <p className="font-bold text-gray-900">{nd.plAvgDepth || '-'}</p>
              </div>
            </div>
            {/* 트렌드 점수 바 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">트렌드 점수</span>
                <span className={`text-sm font-bold ${getScoreColor(kw.trend_score)}`}>{kw.trend_score}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getScoreBg(kw.trend_score)}`}
                  style={{ width: `${kw.trend_score}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">트렌드 점수</span>
              <span className={`text-sm font-bold ${getScoreColor(kw.trend_score)}`}>{kw.trend_score}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreBg(kw.trend_score)}`}
                style={{ width: `${kw.trend_score}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">네이버 검색 데이터가 아직 수집되지 않았습니다.</p>
          </div>
        )}
      </section>

      {/* ② 소싱 가이드 */}
      {(kw.sourcing_tip || kw.margin_range || kw.difficulty || kw.recommended_price_min) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-4 h-4 text-green-600" />
            <h3 className="font-bold text-gray-900">소싱 가이드</h3>
          </div>
          <div className="bg-green-50 rounded-lg p-4 space-y-3">
            {kw.sourcing_tip && (
              <div>
                <span className="text-xs font-medium text-green-700">소싱 팁</span>
                <p className="text-sm text-gray-800 mt-0.5 leading-relaxed">{kw.sourcing_tip}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {(kw.recommended_price_min || kw.recommended_price_max) && (
                <div>
                  <span className="text-gray-500">추천 판매가</span>
                  <p className="font-bold text-gray-900">
                    {kw.recommended_price_min?.toLocaleString()}원 ~ {kw.recommended_price_max?.toLocaleString()}원
                  </p>
                </div>
              )}
              {kw.margin_range && (
                <div>
                  <span className="text-gray-500">예상 마진율</span>
                  <p className="font-bold text-green-600">{kw.margin_range}</p>
                </div>
              )}
              {kw.difficulty && (
                <div>
                  <span className="text-gray-500">진입 난이도</span>
                  <div className="mt-0.5">
                    <Badge
                      label={DIFFICULTY_LABELS[kw.difficulty] || kw.difficulty}
                      colorClass={DIFFICULTY_COLORS[kw.difficulty] || 'bg-gray-100 text-gray-600'}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ③ 키워드 전략 */}
      {(kw.keyword_tip || relatedKws.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-600" />
            <h3 className="font-bold text-gray-900">키워드 전략</h3>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 space-y-3">
            {kw.keyword_tip && (
              <div>
                <span className="text-xs font-medium text-yellow-700">전략 팁</span>
                <p className="text-sm text-gray-800 mt-0.5 leading-relaxed">{kw.keyword_tip}</p>
              </div>
            )}
            {relatedKws.length > 0 && (
              <div>
                <span className="text-xs font-medium text-yellow-700 mb-1.5 block">관련 키워드</span>
                <div className="flex flex-wrap gap-1.5">
                  {relatedKws.map((rk, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 text-xs font-medium bg-white text-gray-700 rounded-full border border-yellow-200"
                    >
                      {rk}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ④ 장단점 분석 */}
      {(pros.length > 0 || cons.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-gray-900">장단점 분석</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pros.length > 0 && (
              <div className="bg-green-50 rounded-lg p-3">
                <span className="text-xs font-medium text-green-700 mb-2 block">장점</span>
                <ul className="space-y-1.5">
                  {pros.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cons.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3">
                <span className="text-xs font-medium text-red-700 mb-2 block">단점</span>
                <ul className="space-y-1.5">
                  {cons.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ⑤ 시즌성 & 메모 */}
      {(kw.seasonality || kw.memo) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-gray-900">시즌성 & 타이밍</h3>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 space-y-2">
            {kw.seasonality && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">시즌</span>
                <span className="font-medium text-gray-800">
                  {SEASON_ICONS[kw.seasonality] || ''} {kw.seasonality}
                </span>
              </div>
            )}
            {kw.memo && (
              <div>
                <span className="text-xs text-gray-500">관리자 메모</span>
                <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{kw.memo}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAnalyze(kw.keyword)}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81430] flex items-center justify-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          키워드 분석
        </button>
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
