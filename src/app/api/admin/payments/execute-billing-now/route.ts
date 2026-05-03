import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { TossPaymentsAPI, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { isRetryable, failureLabel, isBillingKeyInvalid } from '@/lib/payments/failure-codes';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { PAYMENT_RETRY_INTERVAL_HOURS, kstDateStr } from '@/lib/payments/billing-constants';

/**
 * POST /api/admin/payments/execute-billing-now
 * 관리자가 매월 3일 cron 을 기다리지 않고 즉시 결제 실행.
 *
 * 동작: auto-billing cron 의 결제 로직과 동일 — fee_payment_status IN
 *   (awaiting_payment, overdue, suspended) 인 미납 리포트 전체에 대해
 *   각 PT생의 활성 카드로 Toss 빌링키 결제 시도.
 *
 * 중복 결제 방지 (다층):
 *   1) 'paid' 리포트는 query 대상에서 제외
 *   2) UNIQUE INDEX uq_payment_tx_pending_per_report — 동일 리포트에 동시 pending 1개만
 *   3) payment_transactions.toss_order_id UNIQUE — 동일 orderId 두 번 불가
 *   4) payment_mark_success RPC 의 idempotency guard
 *   5) cron_locks 의 행 기반 TTL 락 (auto-billing 과 키 공유로 동시 실행 차단)
 *
 * 안전:
 *   - billing_excluded_until 이 오늘 이후인 PT생은 skip
 *   - 카드 없는 PT생은 skip (overdue 마킹은 cron 이 매월 3일에 처리)
 */

const CRON_LOCK_KEY = 'cron:auto-billing'; // auto-billing 과 동일 락 — 동시 실행 차단
const LOCK_TTL_SECONDS = 30 * 60;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const todayDateStr = kstDateStr();

    // 동시 실행 방지 — auto-billing cron 과 같은 락 사용
    const { data: lockOk } = await serviceClient.rpc('cron_try_acquire_lock', {
      p_key: CRON_LOCK_KEY,
      p_ttl_seconds: LOCK_TTL_SECONDS,
      p_acquired_by: `admin-execute:${user!.id}`,
    });

    if (!lockOk) {
      return NextResponse.json(
        { error: '자동결제 cron 이 이미 실행 중입니다. 잠시 후 다시 시도해주세요.' },
        { status: 409 },
      );
    }

    try {
      // 청구 가능한 리포트 + 카드 + PT 정보 한 번에 조회 (paid 자동 제외)
      const { data: unpaidReports } = await serviceClient
        .from('monthly_reports')
        .select(`
          id, pt_user_id, year_month, total_with_vat, fee_payment_deadline,
          fee_surcharge_amount, fee_interest_amount
        `)
        .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended'])
        .order('year_month', { ascending: true });

      if (!unpaidReports || unpaidReports.length === 0) {
        return NextResponse.json({
          success: true,
          processed: 0,
          succeeded: 0,
          failed: 0,
          message: '청구 대상 리포트 없음',
        });
      }

      const ptUserIds = Array.from(new Set(unpaidReports.map((r) => r.pt_user_id)));

      // PT생 정보 (billing_excluded_until 체크용)
      const { data: ptUsers } = await serviceClient
        .from('pt_users')
        .select('id, profile_id, billing_excluded_until, status, is_test_account')
        .in('id', ptUserIds);

      const ptUserMap = new Map<string, { profile_id: string; excluded: boolean; isTest: boolean; terminated: boolean }>();
      (ptUsers || []).forEach((u) => {
        const excluded = !!u.billing_excluded_until && u.billing_excluded_until >= todayDateStr;
        ptUserMap.set(u.id, {
          profile_id: u.profile_id,
          excluded,
          isTest: !!u.is_test_account,
          terminated: u.status === 'terminated',
        });
      });

      // 활성 + primary 카드 일괄 조회
      const { data: cards } = await serviceClient
        .from('billing_cards')
        .select('id, pt_user_id, billing_key, customer_key')
        .in('pt_user_id', ptUserIds)
        .eq('is_active', true)
        .eq('is_primary', true);

      const cardMap = new Map<string, { id: string; billing_key: string; customer_key: string }>();
      (cards || []).forEach((c) => cardMap.set(c.pt_user_id, c));

      let processed = 0;
      let succeeded = 0;
      let failed = 0;
      let skippedNoCard = 0;
      let skippedExcluded = 0;
      let skippedTerminated = 0;
      const failures: Array<{ ptUserId: string; reportId: string; reason: string }> = [];

      for (const report of unpaidReports) {
        const ptInfo = ptUserMap.get(report.pt_user_id);
        if (!ptInfo) continue;
        if (ptInfo.terminated || ptInfo.isTest) {
          skippedTerminated++;
          continue;
        }
        if (ptInfo.excluded) {
          skippedExcluded++;
          continue;
        }

        const card = cardMap.get(report.pt_user_id);
        if (!card) {
          skippedNoCard++;
          continue;
        }

        const baseAmount = report.total_with_vat || 0;
        if (baseAmount <= 0) continue;

        // 연체 가산금
        let penaltyAmount = 0;
        if (report.fee_payment_deadline) {
          const dday = getFeePaymentDDay(report.fee_payment_deadline);
          if (dday < 0) {
            const penalty = calculateFeePenalty(baseAmount, Math.abs(dday));
            penaltyAmount = penalty.totalPenalty;
          }
        }

        const totalAmount = baseAmount + penaltyAmount;
        const orderId = generateOrderId(report.year_month, report.pt_user_id);
        const orderName = `메가로드 수수료 ${report.year_month} (관리자 즉시 실행)`;

        processed++;

        // 새 트랜잭션 생성 — UNIQUE 제약이 동일 리포트 동시 결제 차단
        const { data: tx, error: txErr } = await serviceClient
          .from('payment_transactions')
          .insert({
            pt_user_id: report.pt_user_id,
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

        if (!tx || txErr) {
          // 동일 리포트에 이미 pending tx 있음 (다른 cron 동시 실행) → skip
          await logSettlementError(serviceClient, {
            stage: 'admin_execute_tx_insert',
            monthlyReportId: report.id,
            ptUserId: report.pt_user_id,
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

          // 멱등 마킹 (성공 → confirmed/paid)
          await serviceClient.rpc('payment_mark_success', {
            p_tx_id: tx.id,
            p_payment_key: result.paymentKey,
            p_receipt_url: result.receipt?.url || null,
            p_raw: result as unknown as Record<string, unknown>,
            p_approved_at: result.approvedAt,
          });

          // 페널티 확정값 고정
          await serviceClient
            .from('monthly_reports')
            .update({
              fee_surcharge_amount: Math.max(0, Math.floor(penaltyAmount * 0.5)),
              fee_interest_amount: Math.max(0, penaltyAmount - Math.floor(penaltyAmount * 0.5)),
            })
            .eq('id', report.id);

          // 정산 후처리
          try {
            const { data: fullReport } = await serviceClient
              .from('monthly_reports')
              .select('*')
              .eq('id', report.id)
              .single();
            if (fullReport) await completeSettlement(serviceClient, fullReport);
          } catch (settleErr) {
            await logSettlementError(serviceClient, {
              stage: 'admin_execute_complete_settlement',
              monthlyReportId: report.id,
              ptUserId: report.pt_user_id,
              error: settleErr,
            });
          }

          await createNotification(serviceClient, {
            userId: ptInfo.profile_id,
            type: 'fee_payment',
            title: '관리자 즉시 결제 완료',
            message: `${report.year_month} 수수료 ${totalAmount.toLocaleString()}원이 결제되었습니다. 정산이 자동 확정되었습니다.`,
            link: '/my/report',
          });

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
              failure_message: errObj.message || '관리자 즉시 결제 실패',
              raw_response: (errObj.raw as Record<string, unknown>) || null,
              failed_at: new Date().toISOString(),
              retry_count: 0,
              next_retry_at: nextRetryAt,
              is_final_failure: !retryable,
              final_failed_at: retryable ? null : new Date().toISOString(),
            })
            .eq('id', tx.id);

          if (isBillingKeyInvalid(code)) {
            await serviceClient
              .from('billing_cards')
              .update({ is_active: false, is_primary: false })
              .eq('id', card.id);
          }

          failures.push({
            ptUserId: report.pt_user_id,
            reportId: report.id,
            reason: failureLabel(code, errObj.message),
          });
          failed++;
        }
      }

      return NextResponse.json({
        success: true,
        processed,
        succeeded,
        failed,
        skippedNoCard,
        skippedExcluded,
        skippedTerminated,
        failures: failures.slice(0, 20), // 응답 크기 제한
      });
    } finally {
      await serviceClient.rpc('cron_release_lock', { p_key: CRON_LOCK_KEY });
    }
  } catch (err) {
    console.error('POST /api/admin/payments/execute-billing-now error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
