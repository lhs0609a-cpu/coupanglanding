import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateCustomerKey, generateOrderId } from '@/lib/payments/toss-client';
import { createNotification } from '@/lib/utils/notifications';
import { BILLING_DAY } from '@/lib/payments/billing-constants';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';

/**
 * POST /api/payments/billing-key/issue
 * 토스 SDK 콜백에서 받은 authKey로 빌링키 발급 + 카드 등록
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { authKey } = await request.json();
    if (!authKey) return NextResponse.json({ error: 'authKey 필요' }, { status: 400 });

    // pt_user 조회
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, profile_id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const customerKey = generateCustomerKey(ptUser.id);

    // 토스 API로 빌링키 발급
    const billing = await TossPaymentsAPI.issueBillingKey(authKey, customerKey);

    const serviceClient = await createServiceClient();

    // 기존 primary 카드 해제
    await serviceClient
      .from('billing_cards')
      .update({ is_primary: false })
      .eq('pt_user_id', ptUser.id)
      .eq('is_primary', true);

    // 새 카드 저장
    const { data: card, error: insertError } = await serviceClient
      .from('billing_cards')
      .insert({
        pt_user_id: ptUser.id,
        customer_key: customerKey,
        billing_key: billing.billingKey,
        card_company: billing.cardCompany,
        card_number: billing.cardNumber,
        card_type: billing.cardType || '신용',
        is_active: true,
        is_primary: true,
        registered_at: billing.authenticatedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 자동결제 스케줄 자동 생성 (첫 카드 등록 시)
    const { data: existingSchedule } = await serviceClient
      .from('payment_schedules')
      .select('id')
      .eq('pt_user_id', ptUser.id)
      .single();

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

    // 락 상태 확인 → 연체 중이면 즉시 미납 결제 시도 (구멍 #74 해결)
    const { data: ptUserFull } = await serviceClient
      .from('pt_users')
      .select('payment_overdue_since, payment_lock_level')
      .eq('id', ptUser.id)
      .single();

    const wasOverdue = !!ptUserFull?.payment_overdue_since;
    let immediateChargeResult: { succeeded: number; failed: number } | null = null;

    if (wasOverdue && card) {
      immediateChargeResult = await attemptImmediateCharge(
        serviceClient,
        ptUser.id,
        card.id as string,
        billing.billingKey,
        billing.customerKey,
      );
    }

    // 알림 — 락 복구 결과에 따라 메시지 분기
    if (wasOverdue && immediateChargeResult && immediateChargeResult.succeeded > 0 && immediateChargeResult.failed === 0) {
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '카드 등록 + 서비스 복구 완료',
        message: `${billing.cardCompany} ${billing.cardNumber} 카드 등록과 동시에 미납 수수료가 모두 결제되어 서비스가 정상 복구되었습니다.`,
        link: '/my/settings',
      });
    } else if (wasOverdue && immediateChargeResult && immediateChargeResult.failed > 0) {
      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '카드 등록됨 — 일부 결제 실패',
        message: `${billing.cardCompany} ${billing.cardNumber} 카드가 등록되었지만 미납 수수료 일부 결제에 실패했습니다. 카드 잔액을 확인해주세요.`,
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
 * 카드 등록 직후, 해당 PT 유저의 미납 리포트를 즉시 결제 시도.
 * 성공 시 payment_overdue_since/payment_lock_level을 클리어한다.
 * 모든 결제가 성공해야 락을 푼다.
 */
async function attemptImmediateCharge(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  ptUserId: string,
  billingCardId: string,
  billingKey: string,
  customerKey: string,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  const { data: unpaidReports } = await serviceClient
    .from('monthly_reports')
    .select('*')
    .eq('pt_user_id', ptUserId)
    .in('fee_payment_status', ['awaiting_payment', 'overdue'])
    .order('year_month', { ascending: true });

  if (!unpaidReports || unpaidReports.length === 0) {
    // 미납 리포트 0건이어도 overdue 플래그가 남아있을 수 있음 (카드 미등록 사유) → 즉시 클리어
    await serviceClient
      .from('pt_users')
      .update({ payment_overdue_since: null, payment_lock_level: 0 })
      .eq('id', ptUserId);
    return { succeeded: 0, failed: 0 };
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

    const { data: tx } = await serviceClient
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

    if (!tx) continue;

    try {
      const result = await TossPaymentsAPI.payWithBillingKey(
        billingKey,
        customerKey,
        totalAmount,
        orderId,
        orderName,
      );

      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'success',
          toss_payment_key: result.paymentKey,
          receipt_url: result.receipt?.url || null,
          raw_response: result as unknown as Record<string, unknown>,
          approved_at: result.approvedAt,
        })
        .eq('id', tx.id);

      await completeSettlement(serviceClient, report);
      succeeded++;
    } catch (payErr) {
      const errObj = payErr as { code?: string; message?: string; raw?: unknown };
      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'failed',
          failure_code: errObj.code || 'UNKNOWN',
          failure_message: errObj.message || '결제 실패',
          raw_response: (errObj.raw as Record<string, unknown>) || null,
          failed_at: new Date().toISOString(),
        })
        .eq('id', tx.id);
      failed++;
    }
  }

  // 모두 성공했으면 락 해제
  if (failed === 0 && succeeded > 0) {
    await serviceClient
      .from('pt_users')
      .update({ payment_overdue_since: null, payment_lock_level: 0 })
      .eq('id', ptUserId);
  }

  return { succeeded, failed };
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
