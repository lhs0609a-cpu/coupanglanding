'use client';

import Link from 'next/link';
import { formatDDay, getDDayColorClass, formatDeadline } from '@/lib/utils/settlement';
import { formatYearMonth } from '@/lib/utils/format';
import type { SettlementStatus } from '@/lib/utils/settlement';
import { TrendingUp } from 'lucide-react';

interface SettlementDDayBannerProps {
  variant: 'full' | 'compact' | 'inline';
  yearMonth: string;
  dday: number;
  reportStatus: SettlementStatus;
  eligible: boolean;
}

export default function SettlementDDayBanner({
  variant,
  yearMonth,
  dday,
  reportStatus,
  eligible,
}: SettlementDDayBannerProps) {
  if (!eligible) return null;

  // full: 기존 /my/report 배너 (그대로)
  if (variant === 'full') {
    return (
      <div className={`rounded-lg p-4 flex items-center justify-between flex-wrap gap-2 ${getDDayColorClass(dday)} border`}>
        <div>
          <p className="text-sm font-medium">
            {formatYearMonth(yearMonth)} 매출 정산 마감
          </p>
          <p className="text-xs mt-0.5 opacity-80">
            마감일: {formatDeadline(yearMonth)}
          </p>
        </div>
        <span className="text-lg font-bold">{formatDDay(dday)}</span>
      </div>
    );
  }

  // compact: 대시보드용 — 1줄 배너 + /my/report 링크
  if (variant === 'compact') {
    const statusLabel =
      reportStatus === 'submitted' ? '처리 중' :
      reportStatus === 'completed' ? '정산 완료' :
      reportStatus === 'overdue' ? '마감 초과' :
      '미제출';

    const showCTA = reportStatus === 'pending' || reportStatus === 'overdue';

    return (
      <Link href="/my/report" className="block">
        <div className={`rounded-lg p-4 flex items-center justify-between flex-wrap gap-2 border hover:shadow-md transition ${getDDayColorClass(dday)}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/60">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {formatYearMonth(yearMonth)} 매출 정산
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                {showCTA ? `마감일: ${formatDeadline(yearMonth)}` : statusLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">{formatDDay(dday)}</span>
            {showCTA && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/60">
                제출하기 →
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // inline: 사이드바용 — 빨간 뱃지 숫자만
  if (variant === 'inline') {
    if (dday > 7 || reportStatus === 'submitted' || reportStatus === 'completed') {
      return null;
    }

    return (
      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
        {dday <= 0 ? `+${Math.abs(dday)}` : dday}
      </span>
    );
  }

  return null;
}
