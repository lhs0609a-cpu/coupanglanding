import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import {
  BILLING_DAY,
  PAYMENT_RETRY_INTERVAL_HOURS,
  kstDay,
  kstDateStr,
  kstNow,
} from '@/lib/payments/billing-constants';
import { isRetryable, failureLabel, isBillingKeyInvalid } from '@/lib/payments/failure-codes';
import { logSettlementError } from '@/lib/payments/settlement-errors';

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

const CRON_LOCK_KEY = 'cron:auto-billing';
// auto-billing 배치 최대 실행 예상 시간(초). 전체 PT 유저 순회 + 외부 결제 호출 포함.
const CRON_LOCK_TTL_SECONDS = 30 * 60;

/**
 * GET /api/cron/auto-billing
 * vercel.json 스케줄: "0 18 * * *" (매일 UTC 18:00 = 다음날 KST 03:00).
 * KST 기준 오늘이 BILLING_DAY(매월 3일)일 때만 실제 결제 수행, 그 외는 no-op.
 *
 * 동시 실행 방지: postgres advisory lock 획득 실패 시 409 로 거부 (Vercel 재시도 대비).
 *
 * 동작:
 *   1) 모든 PT 유저 순회 (signed 계약만)
 *   2) 활성 카드 없음 → payment_overdue_since 마킹 + 알림
 *   3) 활성 카드 있음 → 미납 monthly_reports 결제 시도
 *      - 성공: payment_mark_success RPC + completeSettlement
 *      - 실패(retryable): next_retry_at 세팅 + retry_in_progress=true
 *      - 실패(non-retryable): 즉시 overdue 마킹
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();

  // 동시 실행 방지 — 행 기반 TTL 락 (pg_advisory_lock 의 세션/풀 문제 회피).
  const { data: lockOk } = await serviceClient.rpc('cron_try_acquire_lock', {
    p_key: CRON_LOCK_KEY,
    p_ttl_seconds: CRON_LOCK_TTL_SECONDS,
    p_acquired_by: 'auto-billing',
  });

  if (!lockOk) {
    return NextResponse.json(
      { error: 'auto-billing 이 이미 실행 중', processed: 0 },
      { status: 409 },
    );
  }

  try {
    const now = new Date();
    const todayDay = kstDay(now);
    const todayDateStr = kstDateStr(now);

    if (todayDay !== BILLING_DAY) {
      return NextResponse.json({
        success: true,
        message: `오늘은 청구일이 아님 (KST ${todayDay}일, 청구일=${BILLING_DAY}일)`,
        processed: 0,
      });
    }

    // signed 계약이 있는 PT 유저만 대상 (terminated/draft 제외, 테스트 계정 제외)
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select(`
        id,
        profile_id,
        first_billing_grace_until,
        created_at,
        is_test_account,
        contracts!inner(status)
      `)
      .eq('contracts.status', 'signed')
      .eq('is_test_account', false);

    if (!ptUsers || ptUsers.length === 0) {
      return NextResponse.json({ success: true, message: '대상 PT 유저 없음', processed: 0 });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let overdueMarked = 0;
    let graceSkipped = 0;
    let userErrors = 0;

    for (const ptUser of ptUsers) {
      // grace 기간 — first_billing_grace_until 이 있으면 그 값, 없으면 가입 +1개월 기본
      const graceUntil = ptUser.first_billing_grace_until
        ? ptUser.first_billing_grace_until
        : defaultGraceUntil(ptUser.created_at);

      if (graceUntil && todayDateStr < graceUntil) {
        graceSkipped++;
        continue;
      }

      try {
        const result = await processPtUser(serviceClient, ptUser, todayDateStr);
        processed += result.processed;
        succeeded += result.succeeded;
        failed += result.failed;
        if (result.markedOverdue) overdueMarked++;
      } catch (userErr) {
        userErrors++;
        await logSettlementError(serviceClient, {
          stage: 'auto_billing_user_loop',
          ptUserId: ptUser.id,
          error: userErr,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      succeeded,
      failed,
      overdueMarked,
      graceSkipped,
      userErrors,
    });
  } catch (err) {
    console.error('cron/auto-billing error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  } finally {
    await serviceClient.rpc('cron_release_lock', { p_key: CRON_LOCK_KEY });
  }
}

function defaultGraceUntil(createdAt: string | null): string | null {
  if (!createdAt) return null;
  // KST 기준으로 가입월 +1 (월말 day 클램핑). UTC 기반 setMonth 는 createdAt 의 UTC 시각이
  // 15시 이상이면 KST 익일로 넘어가는 데 반해 grace 종료일이 1일 일찍 끝나는 버그가 있었음.
  const kst = kstNow(new Date(createdAt));
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const day = kst.getUTCDate();
  const lastDayOfNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDayOfNextMonth);
  const target = new Date(Date.UTC(y, m + 1, targetDay));
  return target.toISOString().slice(0, 10);
}

async function processPtUser(
  serviceClient: ServiceClient,
  ptUser: { id: string; profile_id: string },
  todayDateStr: string,
): Promise<{ processed: number; succeeded: number; failed: number; markedOverdue: boolean }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let markedOverdue = false;

  // 활성 + primary 카드 1장 조회
  const { data: card } = await serviceClient
    .from('billing_cards')
    .select('*')
    .eq('pt_user_id', ptUser.id)
    .eq('is_active', true)
    .eq('is_primary', true)
    .maybeSingle();

  // 카드 없음 → overdue 마킹 후 종료
  if (!card) {
    const marked = await markOverdue(serviceClient, ptUser.id, todayDateStr);
    if (marked) {
      markedOverdue = true;
      await notifyMissingCard(serviceClient, ptUser.profile_id);
    }
    return { processed, succeeded, failed, markedOverdue };
  }

  // 미납 리포트 조회 — suspended 도 포함 (자동결제로 복구 가능하게)
  const { data: unpaidReports } = await serviceClient
    .from('monthly_reports')
    .select('*')
    .eq('pt_user_id', ptUser.id)
    .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended'])
    .order('year_month', { ascending: true });

  if (!unpaidReports || unpaidReports.length === 0) {
    const { count: totalReportCount } = await serviceClient
      .from('monthly_reports')
      .select('id', { count: 'exact', head: true })
      .eq('pt_user_id', ptUser.id);

    const hasEverReported = (totalReportCount ?? 0) > 0;

    if (hasEverReported) {
      // 과거엔 보고했는데 이번 청구일에 미납 리포트 0건 = 모두 결제 완료 상태. 정상.
      // 조건부 해제 RPC 사용 — 다른 미결 tx 가 있으면 해제하지 않음.
      await serviceClient.rpc('payment_clear_overdue_if_settled', {
        p_pt_user_id: ptUser.id,
      });
    } else {
      // 한 번도 보고 안 함 + grace도 지남 → 엄격 처리 (락 마킹)
      const marked = await markOverdue(serviceClient, ptUser.id, todayDateStr);
      if (marked) {
        markedOverdue = true;
        await notifyMissingReports(serviceClient, ptUser.profile_id);
      }
    }
    return { processed, succeeded, failed, markedOverdue };
  }

  // 스케줄 한 번만 조회 (counter 갱신용)
  const { data: schedule } = await serviceClient
    .from('payment_schedules')
    .select('id, total_success_count, total_failed_count')
    .eq('pt_user_id', ptUser.id)
    .maybeSingle();

  let allSucceeded = true;
  let anyRetryScheduled = false;
  // 이 실행에서 카드 failed_count 를 이미 증가시켰는지 추적 —
  // 한 유저에 미납 리포트가 여러 개일 때 카드 1장이 N회 누적되는 걸 막는다.
  const cardFailUpdated = new Set<string>();

  for (const report of unpaidReports) {
    processed++;

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
    const orderId = generateOrderId(report.year_month, ptUser.id);
    const orderName = `메가로드 수수료 ${report.year_month} (자동)`;

    const { data: tx, error: txErr } = await serviceClient
      .from('payment_transactions')
      .insert({
        pt_user_id: ptUser.id,
        monthly_report_id: report.id,
        billing_card_id: card.id,
        toss_order_id: orderId,
        amount: baseAmount,
        penalty_amount: penaltyAmount,
        total_amount: totalAmount,
        status: 'pending',
        payment_method: 'card',
        is_auto_payment: true,
      })
      .select()
      .single();

    // 이 리포트에 이미 pending tx 가 있으면 UNIQUE 위반으로 insert 실패 → skip
    if (!tx || txErr) {
      await logSettlementError(serviceClient, {
        stage: 'auto_billing_tx_insert',
        monthlyReportId: report.id,
        ptUserId: ptUser.id,
        error: txErr,
      });
      continue;
    }

    try {
      const result = await TossPaymentsAPI.payWithBillingKey(
        card.billing_key,
        card.customer_key,
        totalAmount,
        orderId,
        orderName,
      );

      // 원자적 성공 처리
      const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
        p_tx_id: tx.id,
        p_payment_key: result.paymentKey,
        p_receipt_url: result.receipt?.url || null,
        p_raw: result as unknown as Record<string, unknown>,
        p_approved_at: result.approvedAt,
      });

      if (rpcErr) throw rpcErr;

      // 페널티 금액을 리포트에 확정값으로 고정 (fee-payment-check가 덮어쓰지 않도록)
      await serviceClient
        .from('monthly_reports')
        .update({
          fee_surcharge_amount: Math.max(0, Math.floor(penaltyAmount * 0.5)),
          fee_interest_amount: Math.max(0, penaltyAmount - Math.floor(penaltyAmount * 0.5)),
        })
        .eq('id', report.id);

      if (schedule?.id) {
        // atomic increment — 동시 cron(자동결제 + 재시도 + 즉시결제) 충돌 시 카운터 손실 방지
        await serviceClient.rpc('payment_schedule_increment', {
          p_schedule_id: schedule.id,
          p_success_delta: 1,
          p_failed_delta: 0,
          p_set_last_charged: true,
        });
      }

      try {
        await completeSettlement(serviceClient, report);
      } catch (settleErr) {
        await logSettlementError(serviceClient, {
          stage: 'auto_billing_complete_settlement',
          monthlyReportId: report.id,
          ptUserId: ptUser.id,
          error: settleErr,
        });
      }

      await createNotification(serviceClient, {
        userId: ptUser.profile_id,
        type: 'fee_payment',
        title: '자동결제 및 정산 완료',
        message: `${report.year_month} 수수료 ${totalAmount.toLocaleString()}원이 자동 결제되었습니다. 정산이 자동 확정되었습니다.`,
        link: '/my/report',
      });

      succeeded++;
    } catch (payErr) {
      allSucceeded = false;
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
          failure_message: errObj.message || '자동결제 실패',
          raw_response: (errObj.raw as Record<string, unknown>) || null,
          failed_at: new Date().toISOString(),
          retry_count: 0,
          next_retry_at: nextRetryAt,
          is_final_failure: !retryable,
          final_failed_at: retryable ? null : new Date().toISOString(),
        })
        .eq('id', tx.id);

      if (!cardFailUpdated.has(card.id)) {
        await serviceClient.rpc('billing_card_increment_failed', {
          p_card_id: card.id,
        });
        cardFailUpdated.add(card.id);
      }

      if (schedule?.id) {
        await serviceClient.rpc('payment_schedule_increment', {
          p_schedule_id: schedule.id,
          p_success_delta: 0,
          p_failed_delta: 1,
          p_set_last_charged: false,
        });
      }

      if (retryable) {
        anyRetryScheduled = true;
        // 재시도 예정 → 락 마킹 + retry_in_progress=true. overdue_since 는 오늘로 찍어
        // MAX_RETRY_GRACE_DAYS 이내에서만 유예되도록 한다.
        await markOverdue(serviceClient, ptUser.id, todayDateStr);
        await serviceClient
          .from('pt_users')
          .update({ payment_retry_in_progress: true })
          .eq('id', ptUser.id);

        await createNotification(serviceClient, {
          userId: ptUser.profile_id,
          type: 'fee_payment',
          title: '자동결제 일시 실패 — 내일 자동 재시도',
          message: `${report.year_month} 수수료 자동결제가 일시적 사유(${failureLabel(code, errObj.message)})로 실패했습니다. 24시간 후 자동으로 재시도됩니다. (최대 3회)`,
          link: '/my/report',
        });
      } else {
        // 즉시 최종 실패 → 연체 마킹 + 카드 변경 안내
        const marked = await markOverdue(serviceClient, ptUser.id, todayDateStr);
        if (marked) markedOverdue = true;

        // 빌링키 자체가 무효/만료: 카드를 DB에서 즉시 비활성화해 동일 카드로
        // 반복 시도되는 것을 차단. 사용자에겐 "카드 재등록 필요" 강조 알림.
        if (isBillingKeyInvalid(code)) {
          await serviceClient
            .from('billing_cards')
            .update({ is_active: false, is_primary: false })
            .eq('id', card.id);

          await createNotification(serviceClient, {
            userId: ptUser.profile_id,
            type: 'fee_payment',
            title: '등록된 카드의 빌링키가 만료되었습니다',
            message: `${report.year_month} 수수료 자동결제가 실패했습니다. 사유: ${failureLabel(code, errObj.message)}. 등록된 카드를 더 이상 사용할 수 없어 자동으로 비활성화했습니다. 결제 설정에서 카드를 다시 등록해주세요.`,
            link: '/my/settings',
          });
        } else {
          await createNotification(serviceClient, {
            userId: ptUser.profile_id,
            type: 'fee_payment',
            title: '자동결제 실패 — 카드 변경 필요',
            message: `${report.year_month} 수수료 자동결제가 실패했습니다. 사유: ${failureLabel(code, errObj.message)}. 카드 자체 문제로 자동 재시도 대상이 아닙니다. 즉시 결제 카드를 변경해주세요.`,
            link: '/my/settings',
          });
        }
      }

      failed++;
    }
  }

  // 모든 리포트가 성공했으면 조건부로 overdue/retry_in_progress 클리어
  // 재시도 예정된 건이 있으면 아직 해제하지 않는다.
  if (allSucceeded && processed > 0 && !anyRetryScheduled) {
    await serviceClient.rpc('payment_clear_overdue_if_settled', {
      p_pt_user_id: ptUser.id,
    });
  }

  return { processed, succeeded, failed, markedOverdue };
}

/**
 * payment_overdue_since가 비어있을 때만 오늘로 세팅.
 * 이미 연체 중이면 기존 날짜를 보존(락 단계 카운트가 리셋되지 않도록).
 * 새로 마킹했으면 true.
 */
async function markOverdue(
  serviceClient: ServiceClient,
  ptUserId: string,
  todayDateStr: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from('pt_users')
    .update({ payment_overdue_since: todayDateStr })
    .eq('id', ptUserId)
    .is('payment_overdue_since', null)
    .select('id');
  return !!data && data.length > 0;
}

async function notifyMissingCard(serviceClient: ServiceClient, profileId: string) {
  await createNotification(serviceClient, {
    userId: profileId,
    type: 'fee_payment',
    title: '결제 카드 미등록',
    message: '청구일이 도래했지만 등록된 결제 카드가 없습니다. 단계적 서비스 제한이 시작됩니다. 즉시 카드를 등록해주세요.',
    link: '/my/settings',
  });
}

async function notifyMissingReports(serviceClient: ServiceClient, profileId: string) {
  await createNotification(serviceClient, {
    userId: profileId,
    type: 'fee_payment',
    title: '매출 보고 누락',
    message: '정산 대상 월인데 매출 보고가 한 번도 제출되지 않았습니다. 단계적 서비스 제한이 시작됩니다. 즉시 매출을 보고해주세요.',
    link: '/my/report',
  });
}
