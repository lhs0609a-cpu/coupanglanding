/**
 * 결제 재시도 실행 로직 (cron + 관리자 수동 트리거 공용)
 *
 * 동작:
 *   1) 대상 transaction 조회 (status=failed, is_final_failure=false, retry_count<3)
 *   2) 원본 tx 의 billing_card_id 를 우선 사용, 비활성이면 primary 카드로 fallback.
 *      관리자가 즉시 재시도 했을 때도 사용자의 primary 를 바꿨다면 원본 카드가 우선됨.
 *   3) 새 transaction row insert (parent_transaction_id 로 체인 연결) — 이력 보존
 *   4) 성공 → payment_mark_success RPC 로 상태 전이 원자화 + 정산 확정
 *      실패(retry_count < MAX) → next_retry_at += 24h
 *      실패(retry_count = MAX) → is_final_failure=true + 연체 마킹 + 알림
 */

import { TossPaymentsAPI, generateOrderId } from './toss-client';
import { isRetryable, failureLabel, isBillingKeyInvalid } from './failure-codes';
import {
  MAX_PAYMENT_RETRY_COUNT,
  PAYMENT_RETRY_INTERVAL_HOURS,
} from './billing-constants';
import { completeSettlement } from './complete-settlement';
import { logSettlementError } from './settlement-errors';
import { createNotification } from '@/lib/utils/notifications';
import type { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

interface FailedTx {
  id: string;
  pt_user_id: string;
  monthly_report_id: string;
  billing_card_id: string | null;
  amount: number;
  penalty_amount: number;
  total_amount: number;
  retry_count: number;
  parent_transaction_id: string | null;
}

export interface RetryResult {
  txId: string;
  succeeded: boolean;
  finalFailed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

interface CardRow {
  id: string;
  billing_key: string;
  customer_key: string;
  failed_count: number | null;
}

/**
 * 재시도에 쓸 카드 선택: 원본 tx 의 billing_card_id 를 우선, 비활성/없음 시 primary 로 fallback.
 */
async function pickRetryCard(
  serviceClient: ServiceClient,
  ptUserId: string,
  originalCardId: string | null,
): Promise<CardRow | null> {
  if (originalCardId) {
    const { data: original } = await serviceClient
      .from('billing_cards')
      .select('id, billing_key, customer_key, failed_count, is_active')
      .eq('id', originalCardId)
      .eq('pt_user_id', ptUserId)
      .maybeSingle();

    if (original && original.is_active) {
      return {
        id: original.id,
        billing_key: original.billing_key,
        customer_key: original.customer_key,
        failed_count: original.failed_count ?? 0,
      };
    }
  }

  const { data: primary } = await serviceClient
    .from('billing_cards')
    .select('id, billing_key, customer_key, failed_count')
    .eq('pt_user_id', ptUserId)
    .eq('is_active', true)
    .eq('is_primary', true)
    .maybeSingle();

  return (primary as CardRow | null) ?? null;
}

export async function retryTransaction(
  serviceClient: ServiceClient,
  failedTx: FailedTx,
  todayDateStr: string,
): Promise<RetryResult> {
  const ptUserId = failedTx.pt_user_id;
  const txId = failedTx.id;

  const card = await pickRetryCard(serviceClient, ptUserId, failedTx.billing_card_id);

  // 카드 없음 → 더 이상 시도 불가, final failure + 사용자 알림
  if (!card) {
    await markFinalFailure(serviceClient, txId, ptUserId, todayDateStr);

    // 원본 tx 도 final 로 정리
    await serviceClient
      .from('payment_transactions')
      .update({
        is_final_failure: true,
        final_failed_at: new Date().toISOString(),
        next_retry_at: null,
        failure_code: 'NO_ACTIVE_CARD',
        failure_message: '재시도 시점에 활성 카드가 없음',
      })
      .eq('id', txId);

    // 리포트→유저 조회 후 알림
    const { data: reportForNotify } = await serviceClient
      .from('monthly_reports')
      .select('year_month, profile_id')
      .eq('id', failedTx.monthly_report_id)
      .maybeSingle();

    if (reportForNotify?.profile_id) {
      await createNotification(serviceClient, {
        userId: reportForNotify.profile_id,
        type: 'fee_payment',
        title: '자동 재시도 중단 — 등록된 카드 없음',
        message: `${reportForNotify.year_month} 수수료 재시도 시점에 활성화된 결제 카드가 없어 자동 재시도가 중단되었습니다. 결제 설정에서 카드를 등록해주세요.`,
        link: '/my/settings',
      });
    }

    return {
      txId,
      succeeded: false,
      finalFailed: true,
      errorCode: 'NO_ACTIVE_CARD',
      errorMessage: '활성 카드 없음',
    };
  }

  // 리포트 조회
  const { data: report } = await serviceClient
    .from('monthly_reports')
    .select('id, year_month, profile_id')
    .eq('id', failedTx.monthly_report_id)
    .single();

  if (!report) {
    return {
      txId,
      succeeded: false,
      finalFailed: false,
      errorCode: 'REPORT_NOT_FOUND',
      errorMessage: '리포트를 찾을 수 없음',
    };
  }

  // 이미 결제된 리포트면(다른 경로로 처리됨) → 원본 tx 를 final 로 정리 + retry 플래그 해제
  // 테스트 결제(charge-test)는 monthly_report_id=null 이라 현재는 안전하지만,
  // 향후 변경에 대비해 명시적으로 is_test_transaction=false 필터 적용.
  const { data: paidCheck } = await serviceClient
    .from('payment_transactions')
    .select('id')
    .eq('monthly_report_id', failedTx.monthly_report_id)
    .eq('status', 'success')
    .eq('is_test_transaction', false)
    .limit(1)
    .maybeSingle();

  if (paidCheck) {
    await serviceClient
      .from('payment_transactions')
      .update({ next_retry_at: null, is_final_failure: true })
      .eq('id', txId);
    await maybeClearRetryFlag(serviceClient, ptUserId);
    return { txId, succeeded: true, finalFailed: false };
  }

  const newRetryCount = failedTx.retry_count + 1;
  const orderId = generateOrderId(report.year_month, ptUserId);
  const orderName = `메가로드 수수료 ${report.year_month} (재시도 ${newRetryCount}/${MAX_PAYMENT_RETRY_COUNT})`;

  // 새 transaction row 생성 (재시도 기록 보존)
  const { data: newTx, error: insertErr } = await serviceClient
    .from('payment_transactions')
    .insert({
      pt_user_id: ptUserId,
      monthly_report_id: failedTx.monthly_report_id,
      billing_card_id: card.id,
      toss_order_id: orderId,
      amount: failedTx.amount,
      penalty_amount: failedTx.penalty_amount,
      total_amount: failedTx.total_amount,
      status: 'pending',
      payment_method: 'card',
      is_auto_payment: true,
      retry_count: newRetryCount,
      parent_transaction_id: failedTx.parent_transaction_id || failedTx.id,
    })
    .select()
    .single();

  if (!newTx || insertErr) {
    // UNIQUE (monthly_report_id WHERE status='pending') 충돌 가능 — 이미 다른 경로가 처리중.
    await logSettlementError(serviceClient, {
      stage: 'retry_tx_insert',
      monthlyReportId: failedTx.monthly_report_id,
      ptUserId,
      error: insertErr,
      detail: { txId, newRetryCount },
    });
    return {
      txId,
      succeeded: false,
      finalFailed: false,
      errorCode: 'INSERT_FAILED',
      errorMessage: insertErr?.message || '재시도 트랜잭션 생성 실패',
    };
  }

  try {
    const result = await TossPaymentsAPI.payWithBillingKey(
      card.billing_key,
      card.customer_key,
      failedTx.total_amount,
      orderId,
      orderName,
    );

    // 원자적 성공 처리 RPC — payment_transactions/monthly_reports/billing_cards 를 한 트랜잭션으로
    const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
      p_tx_id: newTx.id,
      p_payment_key: result.paymentKey,
      p_receipt_url: result.receipt?.url || null,
      p_raw: result as unknown as Record<string, unknown>,
      p_approved_at: result.approvedAt,
    });

    if (rpcErr) {
      await logSettlementError(serviceClient, {
        stage: 'payment_mark_success_rpc',
        monthlyReportId: failedTx.monthly_report_id,
        ptUserId,
        error: rpcErr,
        detail: { txId: newTx.id },
      });
      throw rpcErr;
    }

    // 원본 tx 도 종결 처리 (next_retry_at 클리어)
    await serviceClient
      .from('payment_transactions')
      .update({ next_retry_at: null })
      .eq('id', txId);

    // settle
    const { data: fullReport } = await serviceClient
      .from('monthly_reports')
      .select('*')
      .eq('id', failedTx.monthly_report_id)
      .single();

    if (fullReport) {
      try {
        await completeSettlement(serviceClient, fullReport);
      } catch (settleErr) {
        await logSettlementError(serviceClient, {
          stage: 'complete_settlement_retry',
          monthlyReportId: failedTx.monthly_report_id,
          ptUserId,
          error: settleErr,
        });
      }
    }

    // 락/재시도 플래그 — "이 유저의 다른 미결 결제가 없을 때만" 해제 (RPC 로 조건부)
    // 반환값(bool) 으로 "이번에 락이 풀렸는지" 판정 → 알림 문구 분기.
    const { data: lockClearedNow } = await serviceClient.rpc('payment_clear_overdue_if_settled', {
      p_pt_user_id: ptUserId,
    });

    if (report.profile_id) {
      if (lockClearedNow) {
        await createNotification(serviceClient, {
          userId: report.profile_id,
          type: 'fee_payment',
          title: '재시도 결제 완료 — 서비스 정상 이용 가능',
          message: `${report.year_month} 수수료 ${failedTx.total_amount.toLocaleString()}원이 ${newRetryCount}차 재시도에서 결제되었습니다. 미납이 모두 해소되어 결제 락이 자동 해제되었으며, 이제 모든 서비스를 정상적으로 이용하실 수 있습니다.`,
          link: '/my/report',
        });
      } else {
        await createNotification(serviceClient, {
          userId: report.profile_id,
          type: 'fee_payment',
          title: '자동 재시도 결제 성공',
          message: `${report.year_month} 수수료 ${failedTx.total_amount.toLocaleString()}원이 ${newRetryCount}차 재시도에서 결제되었습니다. 정산이 자동 확정되었습니다.`,
          link: '/my/report',
        });
      }
    }

    return { txId: newTx.id, succeeded: true, finalFailed: false };
  } catch (payErr) {
    const errObj = payErr as { code?: string; message?: string; raw?: unknown };
    const code = errObj.code || 'UNKNOWN';
    const retryable = isRetryable(code);

    const isLastTry = newRetryCount >= MAX_PAYMENT_RETRY_COUNT;
    const goFinal = !retryable || isLastTry;

    const nextRetryAt = goFinal
      ? null
      : new Date(Date.now() + PAYMENT_RETRY_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();

    await serviceClient
      .from('payment_transactions')
      .update({
        status: 'failed',
        failure_code: code,
        failure_message: errObj.message || '재시도 실패',
        raw_response: (errObj.raw as Record<string, unknown>) || null,
        failed_at: new Date().toISOString(),
        next_retry_at: nextRetryAt,
        is_final_failure: goFinal,
        final_failed_at: goFinal ? new Date().toISOString() : null,
      })
      .eq('id', newTx.id);

    // 원본 tx 도 next_retry_at 클리어 (이미 자식이 처리 중이므로 중복 재시도 방지)
    await serviceClient
      .from('payment_transactions')
      .update({ next_retry_at: null })
      .eq('id', txId);

    // atomic increment — 동시 cron 실행 시 카운터 손실 방지
    await serviceClient.rpc('billing_card_increment_failed', {
      p_card_id: card.id,
    });

    if (goFinal) {
      await markFinalFailure(serviceClient, newTx.id, ptUserId, todayDateStr);

      // 빌링키 무효/만료 감지 시 카드 즉시 비활성화 (재시도 루프 차단)
      const billingKeyDead = isBillingKeyInvalid(code);
      if (billingKeyDead) {
        await serviceClient
          .from('billing_cards')
          .update({ is_active: false, is_primary: false })
          .eq('id', card.id);
      }

      if (report.profile_id) {
        const title = billingKeyDead
          ? '등록된 카드의 빌링키가 만료되었습니다'
          : '자동결제 최종 실패 — 즉시 카드 변경 필요';
        const reasonText = billingKeyDead
          ? `${failureLabel(code, errObj.message)}. 등록된 카드를 자동으로 비활성화했습니다`
          : !retryable
            ? `카드 자체 문제 (${failureLabel(code, errObj.message)})`
            : `${MAX_PAYMENT_RETRY_COUNT}회 재시도 모두 실패`;
        const actionHint = billingKeyDead
          ? '결제 설정에서 카드를 다시 등록해주세요'
          : '서비스 단계적 제한이 시작됩니다. 즉시 결제 카드를 변경해주세요';
        await createNotification(serviceClient, {
          userId: report.profile_id,
          type: 'fee_payment',
          title,
          message: `${report.year_month} 수수료 자동결제가 최종 실패했습니다. 사유: ${reasonText}. ${actionHint}.`,
          link: '/my/settings',
        });
      }

      return {
        txId: newTx.id,
        succeeded: false,
        finalFailed: true,
        errorCode: code,
        errorMessage: errObj.message,
      };
    }

    if (report.profile_id) {
      await createNotification(serviceClient, {
        userId: report.profile_id,
        type: 'fee_payment',
        title: `자동 재시도 ${newRetryCount}/${MAX_PAYMENT_RETRY_COUNT}차 실패`,
        message: `${report.year_month} 수수료 재시도가 실패했습니다(${failureLabel(code, errObj.message)}). 24시간 후 다시 자동 재시도됩니다.`,
        link: '/my/report',
      });
    }

    return {
      txId: newTx.id,
      succeeded: false,
      finalFailed: false,
      errorCode: code,
      errorMessage: errObj.message,
    };
  }
}

async function markFinalFailure(
  serviceClient: ServiceClient,
  _txId: string,
  ptUserId: string,
  todayDateStr: string,
) {
  // overdue 가 비어있을 때만 오늘로 세팅 + retry_in_progress 해제를 한 번에.
  await serviceClient
    .from('pt_users')
    .update({ payment_overdue_since: todayDateStr, payment_retry_in_progress: false })
    .eq('id', ptUserId)
    .is('payment_overdue_since', null);

  // 이미 overdue가 있던 경우엔 retry 플래그만 해제
  await serviceClient
    .from('pt_users')
    .update({ payment_retry_in_progress: false })
    .eq('id', ptUserId)
    .not('payment_overdue_since', 'is', null);
}

/**
 * 다른 미결 재시도가 없으면 retry_in_progress=false 로 정리
 */
async function maybeClearRetryFlag(serviceClient: ServiceClient, ptUserId: string) {
  const { data: pending } = await serviceClient
    .from('payment_transactions')
    .select('id')
    .eq('pt_user_id', ptUserId)
    .eq('status', 'failed')
    .eq('is_final_failure', false)
    .not('next_retry_at', 'is', null)
    .limit(1);

  if (!pending || pending.length === 0) {
    await serviceClient
      .from('pt_users')
      .update({ payment_retry_in_progress: false })
      .eq('id', ptUserId);
  }
}
