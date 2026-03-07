'use client';

import { useState, useCallback, useEffect } from 'react';
import type { TrendDataPoint } from '@/lib/supabase/types';
import type { PeriodOption } from '@/lib/utils/trend-chart';
import { getCompetitionScore, formatProductCount } from '@/lib/utils/competition';
import KeywordTrendChart from '@/components/charts/KeywordTrendChart';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Search, TrendingUp, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Package, BarChart3, MousePointerClick, AlertCircle } from 'lucide-react';

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

type SortKey = 'rank' | 'totalSearch' | 'productCount' | 'competitionRatio' | 'totalClicks';
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
        case 'productCount':
          aVal = a.productCount ?? 0;
          bVal = b.productCount ?? 0;
          break;
        case 'competitionRatio':
          aVal = a.productCount != null && a.totalSearch > 0 ? a.productCount / a.totalSearch : 999999;
          bVal = b.productCount != null && b.totalSearch > 0 ? b.productCount / b.totalSearch : 999999;
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
          {/* 핵심 통계 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-xs text-gray-500">월간 검색수</p>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {formatNumber(mainRow.totalSearch)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                PC {formatNumber(mainRow.monthlyPcQcCnt)} / M {formatNumber(mainRow.monthlyMobileQcCnt)}
              </p>
            </Card>

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

            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-orange-500" />
                <p className="text-xs text-gray-500">경쟁강도</p>
              </div>
              {mainRow.productCount != null ? (
                <>
                  {(() => {
                    const comp = getCompetitionScore(mainRow.productCount, mainRow.totalSearch);
                    return (
                      <div className="flex items-center gap-2">
                        <Badge label={comp.label} colorClass={`${comp.bgColor} ${comp.textColor}`} />
                        <span className="text-xs text-gray-400">{comp.ratio}</span>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="h-7 flex items-center">
                  <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
                </div>
              )}
            </Card>

            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-1">
                <MousePointerClick className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-gray-500">평균 클릭수</p>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {mainRow.totalClicks > 0 ? formatNumber(Math.round(mainRow.totalClicks * 10) / 10) : '< 10'}
              </p>
            </Card>
          </div>

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
              <table className="w-full text-sm min-w-[700px]">
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
                      className="text-right py-2.5 px-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('totalSearch')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        검색수 <SortIcon column="totalSearch" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('productCount')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        상품수 <SortIcon column="productCount" />
                      </span>
                    </th>
                    <th
                      className="text-center py-2.5 px-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('competitionRatio')}
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        경쟁강도 <SortIcon column="competitionRatio" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2.5 px-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort('totalClicks')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        평균 클릭수 <SortIcon column="totalClicks" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedRows().map((row) => {
                    const comp = row.productCount != null && row.totalSearch > 0
                      ? getCompetitionScore(row.productCount, row.totalSearch)
                      : null;

                    return (
                      <tr
                        key={row.keyword}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                          row.rank === 1 ? 'bg-blue-50/50' : ''
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

                        {/* 검색수 */}
                        <td className="py-2.5 px-3 text-right text-gray-700 font-medium tabular-nums">
                          {formatNumber(row.totalSearch)}
                        </td>

                        {/* 상품수 */}
                        <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">
                          {row.productCount != null ? (
                            formatNumber(row.productCount)
                          ) : (
                            <div className="inline-block w-14 h-4 bg-gray-200 rounded animate-pulse" />
                          )}
                        </td>

                        {/* 경쟁강도 */}
                        <td className="py-2.5 px-3 text-center">
                          {comp ? (
                            <div className="inline-flex flex-col items-center">
                              <span className={`text-xs font-bold ${comp.textColor}`}>
                                {comp.label}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {comp.ratio}
                              </span>
                            </div>
                          ) : row.productCount == null ? (
                            <div className="inline-block w-12 h-4 bg-gray-200 rounded animate-pulse" />
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>

                        {/* 평균 클릭수 */}
                        <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">
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
