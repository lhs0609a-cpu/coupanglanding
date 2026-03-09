'use client';

import { useState, useCallback, useEffect } from 'react';
import type { TrendDataPoint } from '@/lib/supabase/types';
import type { PeriodOption } from '@/lib/utils/trend-chart';
import type { CompetitionLevel } from '@/lib/utils/competition';
import {
  getCompetitionScore,
  formatProductCount,
  calculateCTR,
  calculateShoppingConversion,
  calculateKeywordQuality,
  generateKeywordInsight,
} from '@/lib/utils/competition';
import KeywordTrendChart from '@/components/charts/KeywordTrendChart';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Search, TrendingUp, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Package, BarChart3, MousePointerClick, AlertCircle, Monitor, Smartphone, Zap, ShoppingBag } from 'lucide-react';

/* ─── Inline Sub-components ─── */

/** 5-step horizontal competition gauge */
function CompetitionGauge({ level, size = 'md' }: { level: CompetitionLevel; size?: 'sm' | 'md' }) {
  const steps: { key: CompetitionLevel; color: string }[] = [
    { key: 'very_good', color: 'bg-emerald-500' },
    { key: 'good', color: 'bg-teal-400' },
    { key: 'normal', color: 'bg-yellow-400' },
    { key: 'bad', color: 'bg-orange-400' },
    { key: 'very_bad', color: 'bg-red-500' },
  ];
  const activeIdx = steps.findIndex((s) => s.key === level);
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-1';

  return (
    <div className={`flex ${gap} w-full`}>
      {steps.map((step, i) => (
        <div
          key={step.key}
          className={`flex-1 ${h} rounded-full ${i <= activeIdx ? step.color : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
}

/** PC vs Mobile ratio bar */
function PCMobileBar({ pcValue, mobileValue, size = 'md' }: { pcValue: number; mobileValue: number; size?: 'sm' | 'md' }) {
  const total = pcValue + mobileValue;
  if (total <= 0) return <span className="text-xs text-gray-400">-</span>;
  const pcPct = Math.round((pcValue / total) * 100);
  const mobilePct = 100 - pcPct;
  const h = size === 'sm' ? 'h-2' : 'h-3';

  return (
    <div>
      <div className={`flex ${h} rounded-full overflow-hidden`}>
        <div className="bg-blue-400" style={{ width: `${pcPct}%` }} />
        <div className="bg-orange-400" style={{ width: `${mobilePct}%` }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-blue-600 font-medium">PC {pcPct}%</span>
        <span className="text-[10px] text-orange-600 font-medium">M {mobilePct}%</span>
      </div>
    </div>
  );
}

/** Conic-gradient quality score ring */
function QualityScoreRing({ score, level, label }: { score: number; level: string; label: string }) {
  const colorMap: Record<string, string> = {
    S: '#059669',
    A: '#2563eb',
    B: '#d97706',
    C: '#ea580c',
    D: '#dc2626',
  };
  const color = colorMap[level] || '#6b7280';
  const pct = score;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, #e5e7eb ${pct * 3.6}deg)`,
        }}
      >
        <div className="w-14 h-14 bg-white rounded-full flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] font-semibold" style={{ color }}>{level}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  );
}

/* ─── Types ─── */

interface KeywordRow {
  rank: number;
  keyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  totalSearch: number;
  monthlyAvePcClkCnt: number;
  monthlyAveMobileClkCnt: number;
  totalClicks: number;
  compIdx: string;
  plAvgDepth: number;
  productCount: number | null; // null = loading
}

type SortKey = 'rank' | 'totalSearch' | 'pcSearch' | 'mobileSearch' | 'productCount' | 'competitionRatio' | 'ctr' | 'totalClicks';
type SortDir = 'asc' | 'desc';

interface KeywordAnalysisPanelProps {
  initialKeyword?: string;
}

export default function KeywordAnalysisPanel({ initialKeyword }: KeywordAnalysisPanelProps) {
  const [keyword, setKeyword] = useState(initialKeyword || '');
  const [searching, setSearching] = useState(false);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [initialSearchDone, setInitialSearchDone] = useState(false);
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [period, setPeriod] = useState<PeriodOption>('3m');
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [productCountsLoading, setProductCountsLoading] = useState(false);

  const formatNumber = (n: number) => {
    if (typeof n !== 'number' || n < 0) return '< 10';
    return n.toLocaleString();
  };

  // DataLab API (시계열 트렌드)
  const fetchTrend = useCallback(async (kw: string, p: PeriodOption) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const res = await fetch('/api/trends/datalab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, period: p }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '트렌드 조회 실패');
      }
      const result = await res.json();
      setTrendData(result.data || []);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : '트렌드 조회 실패');
      setTrendData([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // 상품수 조회 (batch)
  const fetchProductCounts = useCallback(async (keywords: string[]) => {
    setProductCountsLoading(true);
    try {
      const res = await fetch('/api/trends/shopping-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      if (res.ok) {
        const counts: Record<string, number> = await res.json();
        setKeywordRows((prev) =>
          prev.map((row) => ({
            ...row,
            productCount: counts[row.keyword] ?? 0,
          }))
        );
      }
    } catch {
      // 상품수 조회 실패 시 0으로 표시
      setKeywordRows((prev) =>
        prev.map((row) => ({
          ...row,
          productCount: row.productCount ?? 0,
        }))
      );
    } finally {
      setProductCountsLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    const kw = keyword.trim();
    if (!kw) return;

    setSearching(true);
    setError(null);
    setActiveKeyword(kw);
    setSortKey('rank');
    setSortDir('asc');

    try {
      // 1. 네이버 키워드 통계 조회
      const statsRes = await fetch('/api/trends/naver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw }),
      });

      if (!statsRes.ok) {
        const errData = await statsRes.json();
        throw new Error(errData.error || '키워드 조회 실패');
      }

      const statsData = await statsRes.json();
      const mainData = statsData.data;
      const relatedKeywords = statsData.relatedKeywords || [];

      // 메인 키워드 + 연관 키워드를 하나의 테이블로 합침
      const rows: KeywordRow[] = [
        {
          rank: 1,
          keyword: mainData.relKeyword || kw,
          monthlyPcQcCnt: mainData.monthlyPcQcCnt,
          monthlyMobileQcCnt: mainData.monthlyMobileQcCnt,
          totalSearch: mainData.monthlyPcQcCnt + mainData.monthlyMobileQcCnt,
          monthlyAvePcClkCnt: mainData.monthlyAvePcClkCnt,
          monthlyAveMobileClkCnt: mainData.monthlyAveMobileClkCnt,
          totalClicks: mainData.monthlyAvePcClkCnt + mainData.monthlyAveMobileClkCnt,
          compIdx: mainData.compIdx,
          plAvgDepth: mainData.plAvgDepth,
          productCount: null,
        },
        ...relatedKeywords.map((rk: KeywordRow & { relKeyword: string }, i: number) => ({
          rank: i + 2,
          keyword: rk.relKeyword,
          monthlyPcQcCnt: rk.monthlyPcQcCnt,
          monthlyMobileQcCnt: rk.monthlyMobileQcCnt,
          totalSearch: rk.monthlyPcQcCnt + rk.monthlyMobileQcCnt,
          monthlyAvePcClkCnt: rk.monthlyAvePcClkCnt || 0,
          monthlyAveMobileClkCnt: rk.monthlyAveMobileClkCnt || 0,
          totalClicks: (rk.monthlyAvePcClkCnt || 0) + (rk.monthlyAveMobileClkCnt || 0),
          compIdx: rk.compIdx,
          plAvgDepth: rk.plAvgDepth || 0,
          productCount: null,
        })),
      ];

      setKeywordRows(rows);

      // 2. 트렌드 차트 병렬 조회
      fetchTrend(kw, period);

      // 3. 상품수 조회 (별도 비동기)
      const allKeywords = rows.map((r) => r.keyword);
      fetchProductCounts(allKeywords);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
      setKeywordRows([]);
    } finally {
      setSearching(false);
    }
  };

  const handlePeriodChange = (p: PeriodOption) => {
    setPeriod(p);
    if (activeKeyword) {
      fetchTrend(activeKeyword, p);
    }
  };

  const handleKeywordClick = (kw: string) => {
    setKeyword(kw);
    setActiveKeyword(kw);
    setSearching(true);
    setError(null);
    setSortKey('rank');
    setSortDir('asc');

    fetch('/api/trends/naver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('조회 실패');
        const data = await res.json();
        const mainData = data.data;
        const related = data.relatedKeywords || [];

        const rows: KeywordRow[] = [
          {
            rank: 1,
            keyword: mainData.relKeyword || kw,
            monthlyPcQcCnt: mainData.monthlyPcQcCnt,
            monthlyMobileQcCnt: mainData.monthlyMobileQcCnt,
            totalSearch: mainData.monthlyPcQcCnt + mainData.monthlyMobileQcCnt,
            monthlyAvePcClkCnt: mainData.monthlyAvePcClkCnt,
            monthlyAveMobileClkCnt: mainData.monthlyAveMobileClkCnt,
            totalClicks: mainData.monthlyAvePcClkCnt + mainData.monthlyAveMobileClkCnt,
            compIdx: mainData.compIdx,
            plAvgDepth: mainData.plAvgDepth,
            productCount: null,
          },
          ...related.map((rk: KeywordRow & { relKeyword: string }, i: number) => ({
            rank: i + 2,
            keyword: rk.relKeyword,
            monthlyPcQcCnt: rk.monthlyPcQcCnt,
            monthlyMobileQcCnt: rk.monthlyMobileQcCnt,
            totalSearch: rk.monthlyPcQcCnt + rk.monthlyMobileQcCnt,
            monthlyAvePcClkCnt: rk.monthlyAvePcClkCnt || 0,
            monthlyAveMobileClkCnt: rk.monthlyAveMobileClkCnt || 0,
            totalClicks: (rk.monthlyAvePcClkCnt || 0) + (rk.monthlyAveMobileClkCnt || 0),
            compIdx: rk.compIdx,
            plAvgDepth: rk.plAvgDepth || 0,
            productCount: null,
          })),
        ];

        setKeywordRows(rows);
        fetchTrend(kw, period);
        fetchProductCounts(rows.map((r) => r.keyword));
      })
      .catch(() => {
        setError('키워드 조회에 실패했습니다.');
      })
      .finally(() => setSearching(false));
  };

  // 초기 키워드가 주어지면 자동 검색
  useEffect(() => {
    if (initialKeyword && !initialSearchDone) {
      setInitialSearchDone(true);
      setKeyword(initialKeyword);
      handleKeywordClick(initialKeyword);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKeyword]);

  // 정렬
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const getSortedRows = () => {
    const rows = [...keywordRows];
    rows.sort((a, b) => {
      let aVal: number, bVal: number;

      switch (sortKey) {
        case 'rank':
          aVal = a.rank;
          bVal = b.rank;
          break;
        case 'totalSearch':
          aVal = a.totalSearch;
          bVal = b.totalSearch;
          break;
        case 'pcSearch':
          aVal = a.monthlyPcQcCnt;
          bVal = b.monthlyPcQcCnt;
          break;
        case 'mobileSearch':
          aVal = a.monthlyMobileQcCnt;
          bVal = b.monthlyMobileQcCnt;
          break;
        case 'productCount':
          aVal = a.productCount ?? 0;
          bVal = b.productCount ?? 0;
          break;
        case 'competitionRatio':
          aVal = a.productCount != null && a.totalSearch > 0 ? a.productCount / a.totalSearch : 999999;
          bVal = b.productCount != null && b.totalSearch > 0 ? b.productCount / b.totalSearch : 999999;
          break;
        case 'ctr':
          aVal = a.totalSearch > 0 ? a.totalClicks / a.totalSearch : 0;
          bVal = b.totalSearch > 0 ? b.totalClicks / b.totalSearch : 0;
          break;
        case 'totalClicks':
          aVal = a.totalClicks;
          bVal = b.totalClicks;
          break;
        default:
          aVal = a.rank;
          bVal = b.rank;
      }

      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return rows;
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-[#E31837]" />
      : <ArrowDown className="w-3 h-3 text-[#E31837]" />;
  };

  const mainRow = keywordRows[0] || null;
  const maxSearch = Math.max(...keywordRows.map((r) => r.totalSearch), 1);

  // Derived metrics for main row
  const mainCTR = mainRow ? calculateCTR(mainRow.totalClicks, mainRow.totalSearch) : 0;
  const mainComp = mainRow && mainRow.productCount != null
    ? getCompetitionScore(mainRow.productCount, mainRow.totalSearch)
    : null;
  const mainConversion = mainRow && mainRow.productCount != null
    ? calculateShoppingConversion(mainRow.productCount, mainRow.totalSearch)
    : null;
  const mainQuality = mainRow && mainComp
    ? calculateKeywordQuality(mainRow.totalSearch, mainComp.level, mainCTR)
    : null;
  const mainPcRatio = mainRow && mainRow.totalSearch > 0
    ? Math.round((mainRow.monthlyPcQcCnt / mainRow.totalSearch) * 100)
    : 0;
  const mainInsight = mainRow && mainComp && mainQuality
    ? generateKeywordInsight(mainRow.totalSearch, mainCTR, mainComp.level, mainPcRatio, mainQuality.level)
    : null;

  return (
    <div className="space-y-6">
      {/* 검색 바 */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="키워드를 입력하세요 (예: 무선이어폰, 트위드자켓)"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] text-sm"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !keyword.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81430] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            분석
          </button>
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 결과 영역 */}
      {activeKeyword && mainRow && (
        <>
          {/* 핵심 통계 카드 6개 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 월간 검색수 + PC/Mobile 미니바 */}
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-xs text-gray-500">월간 검색수</p>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {formatNumber(mainRow.totalSearch)}
              </p>
              <div className="mt-1.5">
                <PCMobileBar pcValue={mainRow.monthlyPcQcCnt} mobileValue={mainRow.monthlyMobileQcCnt} size="sm" />
              </div>
            </Card>

            {/* 상품수 */}
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3.5 h-3.5 text-purple-500" />
                <p className="text-xs text-gray-500">상품수</p>
              </div>
              {mainRow.productCount != null ? (
                <p className="text-lg font-bold text-gray-900">
                  {formatProductCount(mainRow.productCount)}
                </p>
              ) : (
                <div className="h-7 flex items-center">
                  <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
                </div>
              )}
            </Card>

            {/* 경쟁강도 + 5단 게이지 */}
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-orange-500" />
                <p className="text-xs text-gray-500">경쟁강도</p>
              </div>
              {mainComp ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge label={mainComp.label} colorClass={`${mainComp.bgColor} ${mainComp.textColor}`} />
                    <span className="text-xs text-gray-400">{mainComp.ratio}</span>
                  </div>
                  <div className="mt-1.5">
                    <CompetitionGauge level={mainComp.level} size="sm" />
                  </div>
                </>
              ) : (
                <div className="h-7 flex items-center">
                  <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
                </div>
              )}
            </Card>

            {/* 평균 클릭수 */}
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <MousePointerClick className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-gray-500">평균 클릭수</p>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {mainRow.totalClicks > 0 ? formatNumber(Math.round(mainRow.totalClicks * 10) / 10) : '< 10'}
              </p>
            </Card>

            {/* 클릭률(CTR) */}
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-xs text-gray-500">클릭률 (CTR)</p>
              </div>
              <p className={`text-lg font-bold ${mainCTR >= 5 ? 'text-emerald-600' : mainCTR >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>
                {mainCTR.toFixed(2)}%
              </p>
            </Card>

            {/* 쇼핑전환 지표 */}
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
                <p className="text-xs text-gray-500">수요/공급</p>
              </div>
              {mainConversion ? (
                <Badge label={mainConversion.label} colorClass={`${mainConversion.bgColor} ${mainConversion.color}`} />
              ) : (
                <div className="h-7 flex items-center">
                  <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
                </div>
              )}
            </Card>
          </div>

          {/* 쇼핑 인사이트 섹션 */}
          {mainComp && mainQuality && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-[#E31837]" />
                <h3 className="text-base font-bold text-gray-900">쇼핑 인사이트</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left: PC/Mobile ratios */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Monitor className="w-3.5 h-3.5 text-blue-500" />
                      <Smartphone className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs font-medium text-gray-600">검색 비율</span>
                    </div>
                    <PCMobileBar pcValue={mainRow.monthlyPcQcCnt} mobileValue={mainRow.monthlyMobileQcCnt} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Monitor className="w-3.5 h-3.5 text-blue-500" />
                      <Smartphone className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs font-medium text-gray-600">클릭 비율</span>
                    </div>
                    <PCMobileBar pcValue={mainRow.monthlyAvePcClkCnt} mobileValue={mainRow.monthlyAveMobileClkCnt} />
                  </div>
                </div>

                {/* Center: Competition gauge (large) */}
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-medium text-gray-600 mb-2">경쟁강도 게이지</span>
                  <div className="w-full max-w-[200px]">
                    <CompetitionGauge level={mainComp.level} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge label={mainComp.label} colorClass={`${mainComp.bgColor} ${mainComp.textColor}`} />
                    <span className="text-sm text-gray-500">비율 {mainComp.ratio}</span>
                  </div>
                </div>

                {/* Right: Quality score ring */}
                <div className="flex justify-center">
                  <QualityScoreRing
                    score={mainQuality.score}
                    level={mainQuality.level}
                    label={`키워드 품질: ${mainQuality.label}`}
                  />
                </div>
              </div>

              {/* Insight text */}
              {mainInsight && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    <span className="font-medium text-amber-700 mr-1">Insight</span>
                    {mainInsight}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* 트렌드 차트 */}
          <Card>
            <KeywordTrendChart
              keyword={activeKeyword}
              data={trendData}
              period={period}
              onPeriodChange={handlePeriodChange}
              loading={chartLoading}
              error={chartError}
            />
          </Card>

          {/* 키워드 분석 테이블 (아이템스카우트 스타일) */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#E31837]" />
                <h3 className="text-base font-bold text-gray-900">
                  키워드 {keywordRows.length}개
                </h3>
                {productCountsLoading && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    상품수 조회 중...
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[950px]">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th
                      className="text-center py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 w-14"
                      onClick={() => handleSort('rank')}
                    >
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpDown className="w-3 h-3" /> 순위
                      </span>
                    </th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-600">키워드</th>
                    <th
                      className="text-right py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('pcSearch')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        PC <SortIcon column="pcSearch" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('mobileSearch')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        모바일 <SortIcon column="mobileSearch" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('totalSearch')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        총 검색수 <SortIcon column="totalSearch" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('productCount')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        상품수 <SortIcon column="productCount" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('ctr')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        CTR <SortIcon column="ctr" />
                      </span>
                    </th>
                    <th
                      className="text-center py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('competitionRatio')}
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        경쟁강도 <SortIcon column="competitionRatio" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('totalClicks')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        클릭수 <SortIcon column="totalClicks" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedRows().map((row) => {
                    const comp = row.productCount != null && row.totalSearch > 0
                      ? getCompetitionScore(row.productCount, row.totalSearch)
                      : null;
                    const rowCTR = calculateCTR(row.totalClicks, row.totalSearch);
                    const searchBarWidth = maxSearch > 0 ? Math.round((row.totalSearch / maxSearch) * 100) : 0;

                    return (
                      <tr
                        key={row.keyword}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                          row.rank === 1 ? 'bg-blue-50/50 border-l-4 border-l-[#E31837]' : ''
                        }`}
                      >
                        {/* 순위 */}
                        <td className="py-2.5 px-2 text-center text-gray-500 font-medium">
                          {row.rank}
                        </td>

                        {/* 키워드 */}
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => handleKeywordClick(row.keyword)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                          >
                            {row.keyword}
                          </button>
                        </td>

                        {/* PC 검색수 */}
                        <td className="py-2.5 px-2 text-right text-gray-600 tabular-nums text-xs">
                          {formatNumber(row.monthlyPcQcCnt)}
                        </td>

                        {/* 모바일 검색수 */}
                        <td className="py-2.5 px-2 text-right text-gray-600 tabular-nums text-xs">
                          {formatNumber(row.monthlyMobileQcCnt)}
                        </td>

                        {/* 총 검색수 + 비례 바 */}
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-gray-700 font-medium tabular-nums">
                              {formatNumber(row.totalSearch)}
                            </span>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-400 rounded-full"
                                style={{ width: `${searchBarWidth}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* 상품수 */}
                        <td className="py-2.5 px-2 text-right text-gray-700 tabular-nums">
                          {row.productCount != null ? (
                            formatNumber(row.productCount)
                          ) : (
                            <div className="inline-block w-14 h-4 bg-gray-200 rounded animate-pulse" />
                          )}
                        </td>

                        {/* CTR */}
                        <td className="py-2.5 px-2 text-right">
                          <span className={`font-medium tabular-nums ${
                            rowCTR >= 5 ? 'text-emerald-600' : rowCTR >= 2 ? 'text-yellow-600' : 'text-red-500'
                          }`}>
                            {rowCTR.toFixed(1)}%
                          </span>
                        </td>

                        {/* 경쟁강도 + 미니 게이지 */}
                        <td className="py-2.5 px-2 text-center">
                          {comp ? (
                            <div className="inline-flex flex-col items-center gap-1 min-w-[60px]">
                              <div className="flex items-center gap-1">
                                <span className={`text-xs font-bold ${comp.textColor}`}>
                                  {comp.label}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {comp.ratio}
                                </span>
                              </div>
                              <div className="w-full">
                                <CompetitionGauge level={comp.level} size="sm" />
                              </div>
                            </div>
                          ) : row.productCount == null ? (
                            <div className="inline-block w-12 h-4 bg-gray-200 rounded animate-pulse" />
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>

                        {/* 클릭수 */}
                        <td className="py-2.5 px-2 text-right text-gray-700 tabular-nums">
                          {row.totalClicks > 0
                            ? (Math.round(row.totalClicks * 10) / 10).toLocaleString()
                            : '< 10'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* 초기 상태 */}
      {!activeKeyword && !searching && (
        <Card>
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">키워드를 입력하고 분석하세요</p>
            <p className="text-xs mt-2 text-gray-400">
              검색 트렌드, 검색량, 상품수, 경쟁강도를 한눈에 확인할 수 있습니다.
            </p>
            <div className="flex justify-center gap-3 mt-4">
              {['무선이어폰', '선크림', '텀블러'].map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleKeywordClick(ex)}
                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-[#E31837]/10 hover:text-[#E31837] transition"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
