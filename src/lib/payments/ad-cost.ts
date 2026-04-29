/**
 * 광고비 제출 시스템 공용 헬퍼
 *
 * - resolveAdCostForMonth: 특정 월의 확정 광고비 (approved 만 반영, 그 외 0)
 * - validateAdCostAmount : 과대청구 가드 (200% 초과 reject, 30% 이상 warn)
 * - getNextAttemptNo     : 재제출 시 attempt_no 계산 (max 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdCostSubmissionStatus } from '@/lib/supabase/types';

export const AD_COST_MAX_ATTEMPTS = 2;
export const AD_COST_HARD_REJECT_RATIO = 2.0;   // 200% 초과 → 자동 거부
export const AD_COST_WARN_RATIO = 0.3;          // 30% 이상 → 경고 + admin flag

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

/** 청구 금액 검증 — 매출 대비 비율 체크 */
export function validateAdCostAmount(
  amount: number,
  monthlyRevenue: number,
): AdCostValidation {
  if (amount < 0) {
    return { ok: false, reason: '광고비는 0원 이상이어야 합니다', level: 'reject' };
  }
  if (monthlyRevenue <= 0) {
    // 매출 0 이면 비율 판단 불가 — 절대값만 1억 초과 차단
    if (amount > 100_000_000) {
      return { ok: false, reason: '매출 0원인 달에 광고비 1억 초과는 입력할 수 없습니다', level: 'reject', ratio: Infinity };
    }
    return { ok: true };
  }
  const ratio = amount / monthlyRevenue;
  if (ratio > AD_COST_HARD_REJECT_RATIO) {
    return {
      ok: false,
      reason: `광고비가 매출의 ${Math.round(ratio * 100)}% 입니다. 200% 를 초과할 수 없습니다 (오타 확인 필요)`,
      level: 'reject',
      ratio,
    };
  }
  if (ratio >= AD_COST_WARN_RATIO) {
    return {
      ok: true,
      reason: `광고비가 매출의 ${Math.round(ratio * 100)}% 로 평균보다 높습니다. 정확한 금액인지 다시 확인해 주세요`,
      level: 'warn',
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
