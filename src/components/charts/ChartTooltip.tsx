'use client';

import type { TooltipProps } from 'recharts';
import { formatChartDate } from '@/lib/utils/trend-chart';

interface ChartTooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  periodType: 'day' | 'week' | 'month';
}

export default function ChartTooltip({ active, payload, label, periodType }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-900 mb-1.5">
        {formatChartDate(label as string, periodType)}
      </p>
      <div className="space-y-1">
        {(payload as ChartTooltipPayloadItem[]).map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-600">{item.name}</span>
            </div>
            <span className="font-semibold text-gray-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
