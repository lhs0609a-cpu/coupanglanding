'use client';

import { useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { TrendDataPoint } from '@/lib/supabase/types';
import type { PeriodOption } from '@/lib/utils/trend-chart';
import { formatChartDate, findPeakAndTrough, calculateTrendDirection, PERIOD_OPTIONS } from '@/lib/utils/trend-chart';
import ChartTooltip from './ChartTooltip';
import ChartPeriodSelector from './ChartPeriodSelector';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

interface KeywordTrendChartProps {
  keyword: string;
  data: TrendDataPoint[];
  period: PeriodOption;
  onPeriodChange: (period: PeriodOption) => void;
  loading?: boolean;
  error?: string | null;
}

export default function KeywordTrendChart({
  data,
  period,
  onPeriodChange,
  loading = false,
  error = null,
}: KeywordTrendChartProps) {
  const config = PERIOD_OPTIONS[period];
  const { peak, trough } = findPeakAndTrough(data);
  const direction = calculateTrendDirection(data);

  const TrendIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const trendColor = direction === 'up' ? 'text-green-600' : direction === 'down' ? 'text-red-600' : 'text-gray-500';
  const trendLabel = direction === 'up' ? '상승 추세' : direction === 'down' ? '하락 추세' : '보합';

  const formatXTick = useCallback(
    (value: string) => formatChartDate(value, config.periodType),
    [config.periodType]
  );

  // X축 간격 조절
  const tickInterval = data.length > 20 ? Math.floor(data.length / 8) : data.length > 10 ? 2 : 0;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-900">검색 트렌드</h3>
          {data.length > 0 && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {trendLabel}
            </div>
          )}
        </div>
        <ChartPeriodSelector
          selected={period}
          onChange={onPeriodChange}
          disabled={loading}
        />
      </div>

      {/* 차트 영역 */}
      <div className="bg-gray-50 rounded-xl p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">데이터 조회 중...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-400">
              <p className="text-sm">{error}</p>
              <button
                onClick={() => onPeriodChange(period)}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-400">트렌드 데이터가 없습니다.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={data}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="period"
                  tickFormatter={formatXTick}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  interval={tickInterval}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  content={<ChartTooltip periodType={config.periodType} />}
                />
                {peak && (
                  <ReferenceLine
                    y={peak.ratio}
                    stroke="#3B82F6"
                    strokeDasharray="3 3"
                    strokeOpacity={0.4}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="ratio"
                  name="검색 비율"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: '#3B82F6',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>

            {/* 요약 통계 */}
            <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
              {peak && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  최고: <span className="font-medium text-gray-700">{peak.ratio}</span>
                  <span className="text-gray-400">({formatChartDate(peak.period, config.periodType)})</span>
                </div>
              )}
              {trough && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  최저: <span className="font-medium text-gray-700">{trough.ratio}</span>
                  <span className="text-gray-400">({formatChartDate(trough.period, config.periodType)})</span>
                </div>
              )}
              {data.length > 0 && (
                <div className="flex items-center gap-1">
                  평균: <span className="font-medium text-gray-700">
                    {(data.reduce((s, p) => s + p.ratio, 0) / data.length).toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
