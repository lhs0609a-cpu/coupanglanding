'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthPickerProps {
  value: string; // "2026-02"
  onChange: (value: string) => void;
}

export default function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [year, month] = value.split('-').map(Number);

  const prev = () => {
    if (month === 1) {
      onChange(`${year - 1}-12`);
    } else {
      onChange(`${year}-${String(month - 1).padStart(2, '0')}`);
    }
  };

  const next = () => {
    if (month === 12) {
      onChange(`${year + 1}-01`);
    } else {
      onChange(`${year}-${String(month + 1).padStart(2, '0')}`);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={prev}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition"
        aria-label="이전 달"
      >
        <ChevronLeft className="w-5 h-5 text-gray-600" />
      </button>
      <span className="text-lg font-semibold text-gray-900 min-w-[120px] text-center">
        {year}년 {month}월
      </span>
      <button
        type="button"
        onClick={next}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition"
        aria-label="다음 달"
      >
        <ChevronRight className="w-5 h-5 text-gray-600" />
      </button>
    </div>
  );
}
