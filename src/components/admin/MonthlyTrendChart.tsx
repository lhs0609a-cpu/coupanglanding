'use client';

import { useMemo } from 'react';
import { formatKRW } from '@/lib/utils/format';

interface MonthlyTrendChartProps {
  data: { month: string; revenue: number; expenses: number }[];
}

export default function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  const maxValue = useMemo(() => {
    const allValues = data.flatMap((d) => [d.revenue, d.expenses]);
    const max = Math.max(...allValues, 0);
    return max > 0 ? max : 1;
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-12">
        월별 데이터가 없습니다.
      </div>
    );
  }

  const chartHeight = 220;
  const barMaxHeight = chartHeight - 40; // 상단 값 라벨 여유 공간

  const formatShortKRW = (amount: number): string => {
    if (amount >= 10000000) {
      return `${(amount / 10000000).toFixed(1)}천만`;
    }
    if (amount >= 10000) {
      return `${Math.round(amount / 10000)}만`;
    }
    return formatKRW(amount);
  };

  return (
    <div className="w-full">
      {/* 범례 */}
      <div className="flex items-center gap-4 mb-4 justify-end">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#E31837]" />
          <span className="text-xs text-gray-600">수익</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-400" />
          <span className="text-xs text-gray-600">비용</span>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="flex items-end gap-1 sm:gap-2 w-full" style={{ height: `${chartHeight}px` }}>
        {data.map((item, index) => {
          const revHeight = maxValue > 0 ? (item.revenue / maxValue) * barMaxHeight : 0;
          const expHeight = maxValue > 0 ? (item.expenses / maxValue) * barMaxHeight : 0;

          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center min-w-0"
            >
              {/* 바 영역 */}
              <div
                className="w-full flex items-end justify-center gap-0.5 sm:gap-1"
                style={{ height: `${barMaxHeight}px` }}
              >
                {/* 수익 바 */}
                <div className="flex flex-col items-center flex-1 max-w-[32px]">
                  {item.revenue > 0 && (
                    <span className="text-[10px] text-gray-500 mb-1 whitespace-nowrap">
                      {formatShortKRW(item.revenue)}
                    </span>
                  )}
                  <div
                    className="w-full bg-[#E31837] rounded-t-sm transition-all duration-700 ease-out"
                    style={{
                      height: `${Math.max(revHeight, item.revenue > 0 ? 4 : 0)}px`,
                      minHeight: item.revenue > 0 ? '4px' : '0px',
                    }}
                  />
                </div>

                {/* 비용 바 */}
                <div className="flex flex-col items-center flex-1 max-w-[32px]">
                  {item.expenses > 0 && (
                    <span className="text-[10px] text-gray-500 mb-1 whitespace-nowrap">
                      {formatShortKRW(item.expenses)}
                    </span>
                  )}
                  <div
                    className="w-full bg-gray-400 rounded-t-sm transition-all duration-700 ease-out"
                    style={{
                      height: `${Math.max(expHeight, item.expenses > 0 ? 4 : 0)}px`,
                      minHeight: item.expenses > 0 ? '4px' : '0px',
                    }}
                  />
                </div>
              </div>

              {/* 월 라벨 */}
              <div className="mt-2 text-xs text-gray-500 text-center truncate w-full">
                {formatMonthLabel(item.month)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "2026-03" -> "3월", "2025-12" -> "12월" */
function formatMonthLabel(yearMonth: string): string {
  const parts = yearMonth.split('-');
  if (parts.length >= 2) {
    return `${parseInt(parts[1])}월`;
  }
  return yearMonth;
}
