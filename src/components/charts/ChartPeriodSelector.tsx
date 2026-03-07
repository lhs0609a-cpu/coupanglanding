'use client';

import { PERIOD_OPTIONS, type PeriodOption } from '@/lib/utils/trend-chart';

interface ChartPeriodSelectorProps {
  selected: PeriodOption;
  onChange: (period: PeriodOption) => void;
  disabled?: boolean;
}

export default function ChartPeriodSelector({ selected, onChange, disabled }: ChartPeriodSelectorProps) {
  const options = Object.entries(PERIOD_OPTIONS) as [PeriodOption, (typeof PERIOD_OPTIONS)[PeriodOption]][];

  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {options.map(([key, config]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
            selected === key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {config.label}
        </button>
      ))}
    </div>
  );
}
