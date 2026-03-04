'use client';

import { useMemo } from 'react';

interface SimpleBarChartProps {
  data: { label: string; value: number; color?: string }[];
  maxValue?: number;
  height?: number;
  showValues?: boolean;
}

export default function SimpleBarChart({
  data,
  maxValue,
  height = 200,
  showValues = true,
}: SimpleBarChartProps) {
  const computedMax = useMemo(() => {
    if (maxValue && maxValue > 0) return maxValue;
    const max = Math.max(...data.map((d) => d.value), 0);
    return max > 0 ? max : 1;
  }, [data, maxValue]);

  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-8">
        데이터가 없습니다.
      </div>
    );
  }

  const barHeight = Math.max(24, Math.floor(height / data.length) - 8);

  return (
    <div className="w-full space-y-2">
      {data.map((item, index) => {
        const widthPercent = computedMax > 0 ? (item.value / computedMax) * 100 : 0;
        const barColor = item.color || '#E31837';

        return (
          <div key={index} className="flex items-center gap-3">
            {/* Label */}
            <div className="w-24 text-sm text-gray-600 text-right truncate flex-shrink-0">
              {item.label}
            </div>

            {/* Bar container */}
            <div className="flex-1 bg-gray-100 rounded-md overflow-hidden" style={{ height: `${barHeight}px` }}>
              <div
                className="h-full rounded-md transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(widthPercent, 0)}%`,
                  backgroundColor: barColor,
                  minWidth: item.value > 0 ? '4px' : '0px',
                }}
              />
            </div>

            {/* Value */}
            {showValues && (
              <div className="w-20 text-sm font-medium text-gray-700 text-right flex-shrink-0">
                {item.value.toLocaleString('ko-KR')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
