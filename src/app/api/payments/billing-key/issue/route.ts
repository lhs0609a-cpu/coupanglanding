import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateCustomerKey, generateOrderId } from '@/lib/payments/toss-client';
import { createNotification } from '@/lib/utils/notifications';
import {
  BILLING_DAY,
  PAYMENT_RETRY_INTERVAL_HOURS,
} from '@/lib/payments/billing-constants';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { isRetryable } from '@/lib/payments/failure-codes';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 60;

/**
 * POST /api/payments/billing-key/issue
 * 토스 SDK 콜백에서 받은 authKey로 빌링키 발급 + 카드 등록
 *
 * 카드 등록 순서(원자성 보장을 위해):
 *   1) 토스 API 로 빌링키 발급
 *   2) 새 카드 insert (is_primary=true)
 *   3) 성공 시에만 기존 카드 is_primary=false 로 해제 (step2 실패 시 primary 잃지 않음)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { authKey } = await request.json();
    if (!authKey) return NextResponse.json({ error: 'authKey 필요' }, { status: 400 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, profile_id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const customerKey = generateCustomerKey(ptUser.id);

    const billing = await TossPaymentsAPI.issueBillingKey(authKey, customerKey);

    const serviceClient = await createServiceClient();

    // 기존 primary demote + 새 카드 insert(is_primary=true) 를 한 트랜잭션에서 원자화.
    // 두 단계로 쪼개면 사이에 다른 호출이 .eq('is_primary',true).maybeSingle() 했을 때
    // 다중 행 에러로 "카드 없음" 처리되어 사용자가 잘못된 overdue 마킹을 받을 수 있음.
    const { data: card, error: rpcError } = await serviceClient
      .rpc('billing_card_register_primary', {
        p_pt_user_id: ptUser.id,
        p_customer_key: customerKey,
        p_billing_key: billing.billingKey,
        p_card_company: billing.cardCompany,
        p_card_number: billing.cardNumber,
        p_card_type: billing.cardType || '신용',
        p_registered_at: billing.authenticatedAt || new Date().toISOString(),
      });

    if (rpcError || !card) throw rpcError || new Error('카드 등록 실패');

    // 자동결제 스케줄 자동 생성 (첫 카드 등록 시)
    const { data: existingSchedule } = await serviceClient
      .from('payment_schedules')
      .select('id')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (!existingSchedule && card) {
      await serviceClient
        .from('payment_schedules')
        .insert({
          pt_user_id: ptUser.id,
          auto_payment_enabled: true,
          billing_day: BILLING_DAY,
          billing_card_id: card.id,
        });
    }

    // 락 상태 확인 → 연체 중이면 즉시 미납 결제 시도
    const { data: ptUserFull } = await serviceClient
      .from('pt_users')
      .select('payment_overdue_since, payment_lock_level')
      .eq('id', ptUser.id)
      .single();

    const wasOverdue = !!ptUserFull?.payment_overdue_since;
    let immediateChargeResult: { succeeded: number; failed: number; scheduledRetries: number } | null = null;

    if (wasOverdue && card) {
      immediateChargeResult = await attemptImmediateCharge(
        serviceClient,
        ptUser.id,
        card.id as string,
        billing.billingKey,
        billing.customerKey,
      );
    }

    // 알림 분기
    if (wasOverdue && immediateChargeResult && immediateChargeResult.succeeded > 0 && immediateChargeResult.failed === 0) {
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '카드 등록 + 서비스 복구 완료',
        message: `${billing.cardCompany} ${billing.cardNumber} 카드 등록과 동시에 미납 수수료가 모두 결제되어 서비스가 정상 복구되었습니다.`,
        link: '/my/settings',
      });
    } else if (wasOverdue && immediateChargeResult && immediateChargeResult.failed > 0) {
      const retryText = immediateChargeResult.scheduledRetries > 0
        ? ` ${immediateChargeResult.scheduledRetries}건은 24시간 후 자동 재시도됩니다.`
        : '';
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '카드 등록됨 — 일부 결제 실패',
        message: `${billing.cardCompany} ${billing.cardNumber} 카드가 등록되었지만 미납 수수료 일부 결제에 실패했습니다.${retryText} 카드 잔액을 확인해주세요.`,
        link: '/my/settings',
      });
    } else {
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '결제 카드 등록 완료',
        message: `${billing.cardCompany} ${billing.cardNumber} 카드가 등록되었습니다. 매월 ${BILLING_DAY}일 자동결제가 활성화됩니다.`,
        link: '/my/settings',
      });
    }

    return NextResponse.json({
      success: true,
      card,
      immediateCharge: immediateChargeResult,
    });
  } catch (err) {
    const detail = serializeError(err);
    console.error('billing-key/issue error:', JSON.stringify(detail));
    return NextResponse.json(
      { error: detail.message, code: detail.code, detail },
      { status: 500 },
    );
  }
}

/**
 * 카드 등록 직후 해당 PT 유저의 미납 리포트를 즉시 결제 시도.
 *
 * 실패 처리:
 *   - retryable 코드 → next_retry_at 세팅 + retry_in_progress=true (payment-retry 크론이 잡음)
 *   - non-retryable 코드 → is_final_failure=true
 *
 * 성공 처리:
 *   - 조건부 RPC 로 overdue/lock 해제 (다른 미결이 없을 때만)
 */
async function attemptImmediateCharge(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  ptUserId: string,
  billingCardId: string,
  billingKey: string,
  customerKey: string,
): Promise<{ succeeded: number; failed: number; scheduledRetries: number }> {
  let succeeded = 0;
  let failed = 0;
  let scheduledRetries = 0;

  // suspended 도 포함 — 카드 재등록 복구 시나리오
  const { data: unpaidReports } = await serviceClient
    .from('monthly_reports')
    .select('*')
    .eq('pt_user_id', ptUserId)
    .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended'])
    .order('year_month', { ascending: true });

  if (!unpaidReports || unpaidReports.length === 0) {
    // 미납 리포트 0건이어도 overdue 플래그가 남아있을 수 있음 → 조건부 클리어
    await serviceClient.rpc('payment_clear_overdue_if_settled', {
      p_pt_user_id: ptUserId,
    });
    return { succeeded: 0, failed: 0, scheduledRetries: 0 };
  }

  for (const report of unpaidReports) {
    const baseAmount = report.total_with_vat || 0;
    if (baseAmount <= 0) continue;

    let penaltyAmount = 0;
    if (report.fee_payment_deadline) {
      const dday = getFeePaymentDDay(report.fee_payment_deadline);
      if (dday < 0) {
        const penalty = calculateFeePenalty(baseAmount, Math.abs(dday));
        penaltyAmount = penalty.totalPenalty;
      }
    }

    const totalAmount = baseAmount + penaltyAmount;
    const orderId = generateOrderId(report.year_month, ptUserId);
    const orderName = `메가로드 수수료 ${report.year_month} (카드 등록 즉시)`;

    const { data: tx, error: txErr } = await serviceClient
      .from('payment_transactions')
      .insert({
        pt_user_id: ptUserId,
        monthly_report_id: report.id,
        billing_card_id: billingCardId,
        toss_order_id: orderId,
        amount: baseAmount,
        penalty_amount: penaltyAmount,
        total_amount: totalAmount,
        status: 'pending',
        payment_method: 'card',
        is_auto_payment: false,
      })
      .select()
      .single();

    if (!tx || txErr) {
      await logSettlementError(serviceClient, {
        stage: 'immediate_charge_tx_insert',
        monthlyReportId: report.id,
        ptUserId,
        error: txErr,
      });
      continue;
    }

    try {
      const result = await TossPaymentsAPI.payWithBillingKey(
        billingKey,
        customerKey,
        totalAmount,
        orderId,
        orderName,
      );

      const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
        p_tx_id: tx.id,
        p_payment_key: result.paymentKey,
        p_receipt_url: result.receipt?.url || null,
        p_raw: result as unknown as Record<string, unknown>,
        p_approved_at: result.approvedAt,
      });

      if (rpcErr) throw rpcErr;

      try {
        await completeSettlement(serviceClient, report);
      } catch (settleErr) {
        await logSettlementError(serviceClient, {
          stage: 'immediate_charge_complete_settlement',
          monthlyReportId: report.id,
          ptUserId,
          error: settleErr,
        });
      }
      succeeded++;
    } catch (payErr) {
      const errObj = payErr as { code?: string; message?: string; raw?: unknown };
      const code = errObj.code || 'UNKNOWN';
      const retryable = isRetryable(code);

      const nextRetryAt = retryable
        ? new Date(Date.now() + PAYMENT_RETRY_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
        : null;

      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'failed',
          failure_code: code,
          failure_message: errObj.message || '결제 실패',
          raw_response: (errObj.raw as Record<string, unknown>) || null,
          failed_at: new Date().toISOString(),
          next_retry_at: nextRetryAt,
          is_final_failure: !retryable,
          final_failed_at: retryable ? null : new Date().toISOString(),
        })
        .eq('id', tx.id);

      if (retryable) {
        scheduledRetries++;
        await serviceClient
          .from('pt_users')
          .update({ payment_retry_in_progress: true })
          .eq('id', ptUserId);
      }

      failed++;
    }
  }

  // 모든 리포트가 성공했고 다른 미결 재시도도 없으면 조건부 해제
  if (failed === 0 && succeeded > 0) {
    await serviceClient.rpc('payment_clear_overdue_if_settled', {
      p_pt_user_id: ptUserId,
    });
  }

  return { succeeded, failed, scheduledRetries };
}

function serializeError(err: unknown): {
  message: string;
  code?: string;
  name?: string;
  details?: unknown;
  hint?: unknown;
  stack?: string;
} {
  if (err instanceof Error) {
    const extra = err as unknown as Record<string, unknown>;
    return {
      message: typeof err.message === 'string' ? err.message : String(err.message),
      name: err.name,
      code: typeof extra.code === 'string' ? extra.code : undefined,
      details: extra.details,
      hint: extra.hint,
      stack: err.stack,
    };
  }
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = obj.message;
    return {
      message: typeof msg === 'string' ? msg : JSON.stringify(obj) || '알 수 없는 오류',
      code: typeof obj.code === 'string' ? obj.code : undefined,
      details: obj.details,
      hint: obj.hint,
    };
  }
  return { message: String(err) || '빌링키 발급 실패' };
}
