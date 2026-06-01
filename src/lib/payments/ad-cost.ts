/**
 * 광고비 제출 시스템 공용 헬퍼
 *
 * - resolveAdCostForMonth: 특정 월의 확정 광고비 (approved 만 반영, 그 외 0)
 * - validateAdCostAmount : 과대청구 가드 (200% 초과 reject, 30% 이상 warn)
 * - getNextAttemptNo     : 재제출 시 attempt_no 계산 (max 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdCostSubmissionStatus } from '@/lib/supabase/types';
import { calculateAutoCosts } from '@/lib/calculations/deposit';

export const AD_COST_MAX_ATTEMPTS = 2;

/**
 * 광고비 인정/제출 상한 비율 — "광고 차감 전 순수익"의 10%까지만 제출·차감 인정한다(보수적 정책).
 * 이 비율을 넘는 광고비는 제출 거부되고, 승인되더라도 차감에 반영되지 않는다(초과분 미인정).
 * 결제(자동결제)는 (순수익 − 인정광고비) × share%(기본 30%) 로 계산된다.
 * 진짜 고지출 셀러는 관리자가 승인 시 전액 인정(allowOverCap) 또는 overrideRatio 로 개별 상향 가능.
 * @deprecated AD_COST_STANDARD_RATIO/HARD_REJECT/WARN(매출 기준) — 순수익 10% 정책으로 대체됨.
 */
export const AD_COST_NETPROFIT_RATIO = 0.10;
export const AD_COST_STANDARD_RATIO = 0.10;     // 하위호환 export(=NETPROFIT_RATIO)
/** @deprecated 관리자 목록의 'high' 뱃지용(매출 대비 30%) — 정산 정책은 순수익 10%로 이관됨. */
export const AD_COST_WARN_RATIO = 0.3;

/**
 * 광고 차감 전 순수익 = 매출 − 광고외 자동비용(기본율 합 68% → 순수익≈매출×32%).
 * 리포트 생성(buildCostBreakdown(revenue,0))과 동일 기준이라 제출/승인 일관.
 */
export function netProfitBeforeAd(revenue: number): number {
  if (!(revenue > 0)) return 0;
  const c = calculateAutoCosts(revenue);
  const nonAd = c.cost_product + c.cost_commission + c.cost_returns + c.cost_shipping + c.cost_tax;
  return Math.max(0, revenue - nonAd);
}

/**
 * 차감 인정 광고비 계산: 청구액을 (광고 차감 전 순수익)×10% 로 캡.
 * - npBeforeAd<=0 이면 차감할 순수익이 없음 → 인정액 0(보수적).
 * - overrideRatio: 셀러별 상향 비율(관리자), 미지정 시 순수익 10%.
 * @param npBeforeAd 광고 차감 전 순수익(netProfitBeforeAd). 호출부에서 매출−광고외비용으로 산출.
 * @returns { deductible: 차감 반영액, capped: 캡 발동 여부, capAmount: 적용된 상한액 }
 */
export function capDeductibleAdCost(
  claimedAmount: number,
  npBeforeAd: number,
  overrideRatio?: number,
): { deductible: number; capped: boolean; capAmount: number } {
  const claim = Math.max(0, Math.round(Number(claimedAmount) || 0));
  if (!(npBeforeAd > 0)) return { deductible: 0, capped: claim > 0, capAmount: 0 };
  const ratio = overrideRatio && overrideRatio > 0 ? overrideRatio : AD_COST_NETPROFIT_RATIO;
  const capAmount = Math.round(npBeforeAd * ratio);
  if (claim > capAmount) return { deductible: capAmount, capped: true, capAmount };
  return { deductible: claim, capped: false, capAmount };
}

export interface ResolvedAdCost {
  amount: number;                              // 0 if not approved or no submission
  source: 'approved' | 'pending' | 'rejected' | 'missed' | 'locked' | 'none';
  submission_id: string | null;
}

/** 특정 (pt_user_id, year_month) 의 확정 광고비. approved 외에는 모두 0 */
export async function resolveAdCostForMonth(
  supabase: SupabaseClient,
  ptUserId: string,
  yearMonth: string,
): Promise<ResolvedAdCost> {
  const { data, error } = await supabase
    .from('ad_cost_submissions')
    .select('id, amount, status, attempt_no')
    .eq('pt_user_id', ptUserId)
    .eq('year_month', yearMonth)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { amount: 0, source: 'none', submission_id: null };
  }

  const status = data.status as AdCostSubmissionStatus;
  if (status === 'approved') {
    return { amount: Number(data.amount) || 0, source: 'approved', submission_id: data.id };
  }
  return { amount: 0, source: status === 'pending' ? 'pending' : status, submission_id: data.id };
}

export interface AdCostValidation {
  ok: boolean;
  reason?: string;
  level?: 'warn' | 'reject';
  ratio?: number;
}

/** 청구 금액 검증 — 광고 차감 전 순수익의 10% 상한(보수적). @param npBeforeAd netProfitBeforeAd(매출−광고외비용) */
export function validateAdCostAmount(
  amount: number,
  npBeforeAd: number,
): AdCostValidation {
  if (amount < 0) {
    return { ok: false, reason: '광고비는 0원 이상이어야 합니다', level: 'reject' };
  }
  if (!(npBeforeAd > 0)) {
    // 광고 차감 전 순수익이 0 이하 → 차감할 순수익 없음. 제출은 허용하되 차감 반영 0.
    return {
      ok: true,
      level: 'warn',
      reason: '광고 차감 전 순수익이 0원 이하입니다. 제출은 되지만 광고비가 수수료 차감에 반영되지 않습니다.',
      ratio: Infinity,
    };
  }
  const cap = Math.round(npBeforeAd * AD_COST_NETPROFIT_RATIO);
  const ratio = amount / npBeforeAd;
  if (amount > cap) {
    return {
      ok: false,
      reason: `광고비는 순수익(광고 차감 전 ${npBeforeAd.toLocaleString()}원)의 10%인 ${cap.toLocaleString()}원까지만 제출할 수 있습니다 (현재 ${Math.round(ratio * 100)}%).`,
      level: 'reject',
      ratio,
    };
  }
  return { ok: true, ratio };
}

/** 다음 attempt_no 계산 — pending/approved 가 있으면 재제출 불가 */
export async function getNextAttemptNo(
  supabase: SupabaseClient,
  ptUserId: string,
  yearMonth: string,
): Promise<{ canSubmit: boolean; nextAttemptNo: number; reason?: string }> {
  const { data, error } = await supabase
    .from('ad_cost_submissions')
    .select('id, status, attempt_no')
    .eq('pt_user_id', ptUserId)
    .eq('year_month', yearMonth)
    .order('attempt_no', { ascending: true });

  if (error) {
    return { canSubmit: false, nextAttemptNo: 0, reason: 'DB 조회 실패' };
  }

  const subs = data || [];
  if (subs.length === 0) {
    return { canSubmit: true, nextAttemptNo: 1 };
  }

  // approved/missed/locked 가 있으면 더 이상 제출 불가
  const blocking = subs.find((s) => ['approved', 'missed', 'locked'].includes(s.status));
  if (blocking) {
    const labels: Record<string, string> = {
      approved: '이미 승인된 광고비가 있습니다',
      missed: '제출 마감일이 지나 광고비 0원으로 확정되었습니다',
      locked: '재제출 한도(2회) 초과로 더 이상 제출할 수 없습니다',
    };
    return { canSubmit: false, nextAttemptNo: 0, reason: labels[blocking.status] };
  }

  // pending 이 있으면 재제출 불가 (검토 대기 중)
  const pending = subs.find((s) => s.status === 'pending');
  if (pending) {
    return { canSubmit: false, nextAttemptNo: 0, reason: '검토 대기 중인 제출이 있습니다' };
  }

  // 모두 rejected — 다음 attempt_no
  const maxAttempt = Math.max(...subs.map((s) => Number(s.attempt_no) || 0));
  if (maxAttempt >= AD_COST_MAX_ATTEMPTS) {
    return { canSubmit: false, nextAttemptNo: 0, reason: `재제출 한도(${AD_COST_MAX_ATTEMPTS}회) 초과` };
  }
  return { canSubmit: true, nextAttemptNo: maxAttempt + 1 };
}

/** 직전 달 'YYYY-MM' (KST 기준) — 매월 1일 마감 대상 */
export function getPreviousMonthYM(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const prev = new Date(kst.getFullYear(), kst.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}
