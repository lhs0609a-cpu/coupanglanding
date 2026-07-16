/**
 * 추천(트레이너) 커미션 환수 — 클로백
 *
 * 결제 취소/환불로 정산이 되돌려지면, 그 달에 추천인에게 적립된 커미션도 함께 회수해야 한다.
 * (없으면 "피추천인은 환불받았는데 추천인 커미션은 그대로" 인 구멍이 생긴다)
 *
 * 동작:
 *  - trainer_earnings 를 삭제하지 않고 clawed_back_at 로 마킹(감사 추적 보존)
 *  - trainers.total_earnings 를 음수 delta 로 원자적 차감
 *  - 멱등: 이미 환수된 건은 재실행해도 중복 차감되지 않음(clawed_back_at IS NULL 가드)
 *
 * ⚠️ 이미 지급(deposited/paid)된 뒤 환수되면 실제 현금은 나간 상태다.
 *    그 경우에도 마킹·차감은 수행해 total_earnings 가 음수 방향으로 정정되며,
 *    관리자는 다음 지급에서 상계(offset)하면 된다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logSettlementError } from './settlement-errors';

export interface ClawbackResult {
  clawedBack: boolean;
  amount: number;
  /** 이미 지급된 뒤 환수라 실제 현금 회수가 필요한 경우 */
  alreadyPaidOut: boolean;
  reason?: string;
}

export async function clawbackTrainerEarning(
  serviceClient: SupabaseClient,
  monthlyReportId: string,
  reason: string,
): Promise<ClawbackResult> {
  const none: ClawbackResult = { clawedBack: false, amount: 0, alreadyPaidOut: false };

  const { data: earning } = await serviceClient
    .from('trainer_earnings')
    .select('id, trainer_id, bonus_amount, payment_status, clawed_back_at')
    .eq('monthly_report_id', monthlyReportId)
    .maybeSingle();

  if (!earning) return none; // 추천 관계 없거나 보너스가 없던 달 — 정상
  const e = earning as {
    id: string;
    trainer_id: string;
    bonus_amount: number;
    payment_status: string;
    clawed_back_at: string | null;
  };
  if (e.clawed_back_at) return { ...none, reason: 'already-clawed-back' }; // 멱등

  const amount = Number(e.bonus_amount) || 0;

  // clawed_back_at IS NULL 가드 → 동시 호출 시 한 번만 성공
  const { data: updated, error: updErr } = await serviceClient
    .from('trainer_earnings')
    .update({ clawed_back_at: new Date().toISOString(), clawback_reason: reason.slice(0, 200) })
    .eq('id', e.id)
    .is('clawed_back_at', null)
    .select('id');

  if (updErr) {
    await logSettlementError(serviceClient, {
      stage: 'trainer_clawback_update',
      monthlyReportId,
      error: updErr,
    });
    return none;
  }
  if (!updated || updated.length === 0) return { ...none, reason: 'already-clawed-back' };

  if (amount > 0) {
    const { error: rpcErr } = await serviceClient.rpc('trainer_increment_total_earnings', {
      p_trainer_id: e.trainer_id,
      p_delta: -amount,
    });
    if (rpcErr) {
      await logSettlementError(serviceClient, {
        stage: 'trainer_clawback_decrement',
        monthlyReportId,
        error: rpcErr,
        detail: { trainerId: e.trainer_id, amount },
      });
    }
  }

  return {
    clawedBack: true,
    amount,
    alreadyPaidOut: e.payment_status === 'paid' || e.payment_status === 'deposited',
  };
}
