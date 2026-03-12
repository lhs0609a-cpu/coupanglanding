'use client';

import Link from 'next/link';
import { Banknote, AlertTriangle, XCircle } from 'lucide-react';
import type { FeePaymentStatus } from '@/lib/supabase/types';
import {
  getFeePaymentDDay,
  formatFeeDDay,
  getFeeDDayColor,
  getFeeAlertMessage,
  getFeeAlertLevel,
  calculateFeePenalty,
  SUSPENSION_DAYS,
  GRACE_PERIOD_DAYS,
} from '@/lib/utils/fee-penalty';
import { formatKRW } from '@/lib/utils/format';

interface FeePaymentBannerProps {
  variant: 'compact' | 'full' | 'inline';
  feePaymentStatus: FeePaymentStatus;
  feePaymentDeadline: string | null;
  unpaidAmount: number;       // total_with_vat
  yearMonth: string;          // "2026-02" 형식
  feeSurchargeAmount?: number;
  feeInterestAmount?: number;
}

export default function FeePaymentBanner({
  variant,
  feePaymentStatus,
  feePaymentDeadline,
  unpaidAmount,
  yearMonth,
  feeSurchargeAmount,
  feeInterestAmount,
}: FeePaymentBannerProps) {
  // 표시 조건: awaiting_payment, overdue, suspended만 표시
  if (feePaymentStatus === 'not_applicable' || feePaymentStatus === 'paid') {
    return null;
  }

  if (!feePaymentDeadline) return null;

  const dday = getFeePaymentDDay(feePaymentDeadline);
  const alertLevel = getFeeAlertLevel(dday);
  const alertMessage = getFeeAlertMessage(dday);
  const colorClass = getFeeDDayColor(dday);

  const daysOverdue = dday < 0 ? Math.abs(dday) : 0;
  const penalty = calculateFeePenalty(unpaidAmount, daysOverdue);

  // 서버에 저장된 페널티 금액이 있으면 우선 사용
  const displaySurcharge = feeSurchargeAmount ?? penalty.surchargeAmount;
  const displayInterest = feeInterestAmount ?? penalty.interestAmount;
  const displayTotalPenalty = displaySurcharge + displayInterest;
  const displayTotalDue = unpaidAmount + displayTotalPenalty;

  const monthLabel = (() => {
    const [y, m] = yearMonth.split('-');
    return `${y}년 ${parseInt(m)}월`;
  })();

  // inline: 사이드바 뱃지 (연체 시만)
  if (variant === 'inline') {
    if (feePaymentStatus !== 'overdue' && feePaymentStatus !== 'suspended') {
      return null;
    }

    return (
      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-600 rounded-full ml-1">
        <Banknote className="w-3 h-3" />
      </span>
    );
  }

  // compact: 대시보드용 1줄 배너
  if (variant === 'compact') {
    const Icon = alertLevel === 'suspended' ? XCircle : alertLevel === 'danger' || alertLevel === 'critical' ? AlertTriangle : Banknote;

    return (
      <Link href="/my/report" className="block">
        <div className={`rounded-lg p-4 flex items-center justify-between flex-wrap gap-2 border hover:shadow-md transition ${colorClass}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/60">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {monthLabel} 수수료 납부 {formatFeeDDay(dday)}
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                {daysOverdue > GRACE_PERIOD_DAYS
                  ? `${alertMessage} · 페널티 ${formatKRW(displayTotalPenalty)}`
                  : alertMessage
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">
              {formatKRW(daysOverdue > GRACE_PERIOD_DAYS ? displayTotalDue : unpaidAmount)}
            </span>
            {daysOverdue === 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/60">
                납부하기 →
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // full: 리포트 페이지용
  if (variant === 'full') {
    return (
      <div className={`rounded-lg border ${colorClass}`}>
        {/* 헤더 */}
        <div className="p-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {alertLevel === 'suspended' ? (
              <XCircle className="w-6 h-6" />
            ) : alertLevel === 'danger' || alertLevel === 'critical' ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <Banknote className="w-6 h-6" />
            )}
            <div>
              <p className="font-medium">{alertMessage}</p>
              <p className="text-xs mt-0.5 opacity-80">
                납부 마감일: {new Date(feePaymentDeadline).toLocaleDateString('ko-KR')}
              </p>
            </div>
          </div>
          <span className="text-xl font-bold">{formatFeeDDay(dday)}</span>
        </div>

        {/* 유예 기간 (D+1 ~ D+10): 페널티 없이 안내만 */}
        {daysOverdue > 0 && daysOverdue <= GRACE_PERIOD_DAYS && (
          <div className="border-t px-4 py-3 text-sm">
            <p className="font-medium">미납 금액: {formatKRW(unpaidAmount)}</p>
            <p className="text-xs mt-1 opacity-80">
              유예 기간 내 납부 시 연체 부과금 및 지연이자가 부과되지 않습니다.
            </p>
          </div>
        )}

        {/* 유예 기간 초과 (D+11~): 페널티 내역표 */}
        {daysOverdue > GRACE_PERIOD_DAYS && (
          <div className="border-t px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>미납 금액</span>
              <span className="font-medium">{formatKRW(unpaidAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>연체 부과금 (5%)</span>
              <span className="font-medium">{formatKRW(displaySurcharge)}</span>
            </div>
            <div className="flex justify-between">
              <span>지연이자 (D+{daysOverdue - GRACE_PERIOD_DAYS})</span>
              <span className="font-medium">{formatKRW(displayInterest)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>총 납부액</span>
              <span className="text-lg">{formatKRW(displayTotalDue)}</span>
            </div>
            <p className="text-xs opacity-80 pt-1">
              위 총 납부액을 입금 후 송금완료를 신청해주세요.
            </p>
          </div>
        )}

        {/* 접근 정지 경고 */}
        {daysOverdue >= SUSPENSION_DAYS && (
          <div className="border-t px-4 py-3 bg-red-900/10">
            <p className="text-sm font-bold flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              프로그램 접근이 정지되었습니다. 수수료를 완납 후 접근 복구를 요청하세요.
            </p>
          </div>
        )}

        {daysOverdue > 0 && daysOverdue < SUSPENSION_DAYS && (
          <div className="border-t px-4 py-3 bg-red-900/5">
            <p className="text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {SUSPENSION_DAYS - daysOverdue}일 이내 미납 시 프로그램 접근이 정지됩니다.
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
