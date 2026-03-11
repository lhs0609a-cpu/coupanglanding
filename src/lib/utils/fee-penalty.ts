/**
 * 수수료 납부 지연 페널티 계산 유틸리티
 * - 연체 부과금: 미납 금액의 5%
 * - 지연이자: 연 15% 일할 계산
 * - 접근 정지: 14일 초과 시
 */

/** 상수 */
export const SURCHARGE_RATE = 0.05;        // 연체 부과금 5%
export const ANNUAL_INTEREST_RATE = 0.15;  // 연 15% 지연이자
export const SUSPENSION_DAYS = 14;         // 접근 정지까지 유예일

/** D-Day 계산 (양수=남은일, 0=당일, 음수=초과) */
export function getFeePaymentDDay(deadline: string | Date): number {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const deadlineDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = deadlineDate.getTime() - todayDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** 페널티 계산 결과 */
export interface FeePenaltyResult {
  surchargeAmount: number;   // 연체 부과금
  interestAmount: number;    // 지연이자
  totalPenalty: number;      // 부과금 + 이자
  totalDue: number;          // 미납 + 페널티 합계
  daysOverdue: number;       // 연체일수
}

/** 페널티 계산 */
export function calculateFeePenalty(unpaidAmount: number, daysOverdue: number): FeePenaltyResult {
  if (daysOverdue <= 0 || unpaidAmount <= 0) {
    return { surchargeAmount: 0, interestAmount: 0, totalPenalty: 0, totalDue: unpaidAmount, daysOverdue: 0 };
  }

  const surchargeAmount = Math.floor(unpaidAmount * SURCHARGE_RATE);
  const interestAmount = Math.floor(unpaidAmount * ANNUAL_INTEREST_RATE * daysOverdue / 365);
  const totalPenalty = surchargeAmount + interestAmount;

  return {
    surchargeAmount,
    interestAmount,
    totalPenalty,
    totalDue: unpaidAmount + totalPenalty,
    daysOverdue,
  };
}

/** D-Day 포맷 */
export function formatFeeDDay(dday: number): string {
  if (dday > 0) return `D-${dday}`;
  if (dday === 0) return 'D-Day';
  return `D+${Math.abs(dday)}`;
}

/** D-Day 색상 클래스 */
export function getFeeDDayColor(dday: number): string {
  if (dday >= 8) return 'text-green-600 bg-green-50 border-green-200';
  if (dday >= 4) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  if (dday >= 1) return 'text-orange-600 bg-orange-50 border-orange-200';
  if (dday === 0) return 'text-red-600 bg-red-50 border-red-200';
  if (dday >= -13) return 'text-red-700 bg-red-100 border-red-300';
  return 'text-red-900 bg-red-200 border-red-400'; // D+14 이상
}

/** 알림 단계 */
export type FeeAlertLevel = 'info' | 'warning' | 'danger' | 'critical' | 'suspended';

export function getFeeAlertLevel(dday: number): FeeAlertLevel {
  if (dday >= 8) return 'info';
  if (dday >= 1) return 'warning';
  if (dday >= -13) return 'danger';    // D-Day ~ D+13
  return dday === 0 ? 'danger' : 'suspended';  // D+14 이상
}

/** 에스컬레이션 메시지 */
export function getFeeAlertMessage(dday: number): string {
  if (dday >= 8) return `수수료 납부 마감 ${formatFeeDDay(dday)}`;
  if (dday >= 4) return '납부 마감 임박';
  if (dday >= 1) return `납부 마감 ${dday}일 전!`;
  if (dday === 0) return '오늘 납부 마감일!';
  if (Math.abs(dday) < SUSPENSION_DAYS) {
    const daysLeft = SUSPENSION_DAYS - Math.abs(dday);
    return `연체 중 (접근 정지 ${daysLeft}일 전)`;
  }
  return '프로그램 접근 정지';
}
