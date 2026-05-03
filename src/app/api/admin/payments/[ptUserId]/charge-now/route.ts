import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { TossPaymentsAPI, generateOrderId } from '@/lib/payments/toss-client';
import { calculateFeePenalty, getFeePaymentDDay } from '@/lib/utils/fee-penalty';
import { createNotification } from '@/lib/utils/notifications';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { isRetryable, failureLabel, isBillingKeyInvalid } from '@/lib/payments/failure-codes';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { PAYMENT_RETRY_INTERVAL_HOURS, kstDateStr } from '@/lib/payments/billing-constants';
import { buildCostBreakdown, calculateDeposit } from '@/lib/calculations/deposit';
import { calculateVatOnTop } from '@/lib/calculations/vat';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/payments/[ptUserId]/charge-now
 * 특정 PT생만 즉시 결제 — 클릭 한 번으로 그 사람만.
 *
 * 동작:
 *   1) 직전 마감월 monthly_report 가 없으면 자동 생성 (광고비 0 가정)
 *   2) fee_payment_status='awaiting_payment' 로 마킹
 *   3) Toss 빌링키로 즉시 결제 시도
 *   4) 응답: { succeeded, failed, paymentKey, receiptUrl, errorCode, errorMessage }
 *
 * 중복 결제 방지: paid 면 즉시 중단, UNIQUE 제약 + 멱등 RPC.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ ptUserId: string }> }) {
  try {
    const { ptUserId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const todayDateStr = kstDateStr();

    // PT 사용자 조회
    const { data: ptUser, error: ptErr } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, share_percentage, status, is_test_account, billing_excluded_until')
      .eq('id', ptUserId)
      .single();

    if (ptErr || !ptUser) {
      return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });
    }

    if (ptUser.is_test_account) {
      return NextResponse.json(
        { error: '테스트 계정은 결제 시도 불가' },
        { status: 400 },
      );
    }

    if (ptUser.billing_excluded_until && ptUser.billing_excluded_until >= todayDateStr) {
      return NextResponse.json(
        { error: `결제 제외 기간 (${ptUser.billing_excluded_until}까지)` },
        { status: 400 },
      );
    }

    // 카드
    const { data: card } = await serviceClient
      .from('billing_cards')
      .select('id, billing_key, customer_key')
      .eq('pt_user_id', ptUserId)
      .eq('is_active', true)
      .eq('is_primary', true)
      .maybeSingle();

    if (!card) {
      return NextResponse.json(
        { error: '활성 결제 카드 없음 — PT생이 카드를 먼저 등록해야 합니다.', code: 'NO_CARD' },
        { status: 400 },
      );
    }

    // 직전 마감월 결정
    const [cy, cm] = todayDateStr.slice(0, 7).split('-').map(Number);
    const prevM = cm === 1 ? 12 : cm - 1;
    const prevY = cm === 1 ? cy - 1 : cy;
    const targetMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;

    // 미납 리포트 조회 (모든 마감월) — paid 자동 제외
    const { data: unpaidReports } = await serviceClient
      .from('monthly_reports')
      .select('id, year_month, total_with_vat, fee_payment_status, fee_payment_deadline')
      .eq('pt_user_id', ptUserId)
      .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended'])
      .order('year_month', { ascending: true });

    let reports = unpaidReports || [];

    // 미납 리포트 없으면 직전 마감월 보고서 자동 생성 시도 (snapshot 있을 때만)
    if (reports.length === 0) {
      const { data: existingReport } = await serviceClient
        .from('monthly_reports')
        .select('id, fee_payment_status')
        .eq('pt_user_id', ptUserId)
        .eq('year_month', targetMonth)
        .maybeSingle();

      if (existingReport && existingReport.fee_payment_status === 'paid') {
        return NextResponse.json({
          error: `${targetMonth} 이미 결제 완료된 리포트입니다.`,
          code: 'ALREADY_PAID',
        }, { status: 400 });
      }

      // 보고서 생성 또는 awaiting_review → awaiting_payment 승급
      if (!existingReport) {
        const { data: snap } = await serviceClient
          .from('api_revenue_snapshots')
          .select('total_sales, total_commission, total_shipping, total_returns, total_settlement')
          .eq('pt_user_id', ptUserId)
          .eq('year_month', targetMonth)
          .maybeSingle();

        if (!snap || !snap.total_sales || snap.total_sales <= 0) {
          return NextResponse.json({
            error: `${targetMonth} 매출 데이터 없음 — 결제할 청구 금액 0원`,
            code: 'NO_REVENUE',
          }, { status: 400 });
        }

        const revenue = Number(snap.total_sales);
        const sharePct = ptUser.share_percentage ?? 30;
        const costs = buildCostBreakdown(revenue, 0);
        const depositAmount = calculateDeposit(revenue, costs, sharePct);
        const vatCalc = calculateVatOnTop(depositAmount);

        const [ty, tm] = targetMonth.split('-').map(Number);
        const nextMonth = tm === 12 ? 1 : tm + 1;
        const nextYear = tm === 12 ? ty + 1 : ty;
        const deadlineUtc = new Date(Date.UTC(nextYear, nextMonth - 1, 3, 14, 59, 59));

        const { data: newReport, error: insertErr } = await serviceClient
          .from('monthly_reports')
          .insert({
            pt_user_id: ptUserId,
            year_month: targetMonth,
            reported_revenue: revenue,
            calculated_deposit: depositAmount,
            payment_status: 'reviewed',
            admin_deposit_amount: depositAmount,
            reviewed_at: new Date().toISOString(),
            cost_product: costs.cost_product,
            cost_commission: costs.cost_commission,
            cost_advertising: costs.cost_advertising,
            cost_returns: costs.cost_returns,
            cost_shipping: costs.cost_shipping,
            cost_tax: costs.cost_tax,
            api_verified: true,
            api_settlement_data: snap,
            supply_amount: vatCalc.supplyAmount,
            vat_amount: vatCalc.vatAmount,
            total_with_vat: vatCalc.totalWithVat,
            input_source: 'admin_charge_now',
            fee_payment_status: 'awaiting_payment',
            fee_payment_deadline: deadlineUtc.toISOString(),
            fee_surcharge_amount: 0,
            fee_interest_amount: 0,
          })
          .select('id, year_month, total_with_vat, fee_payment_status, fee_payment_deadline')
          .single();

        if (!newReport || insertErr) {
          return NextResponse.json({
            error: '보고서 생성 실패: ' + (insertErr?.message || ''),
          }, { status: 500 });
        }
        reports = [newReport];
      } else {
        // awaiting_review 승급
        await serviceClient
          .from('monthly_reports')
          .update({
            fee_payment_status: 'awaiting_payment',
            payment_status: 'reviewed',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', existingReport.id);

        const { data: refetched } = await serviceClient
          .from('monthly_reports')
          .select('id, year_month, total_with_vat, fee_payment_status, fee_payment_deadline')
          .eq('id', existingReport.id)
          .single();
        if (refetched) reports = [refetched];
      }
    }

    if (reports.length === 0) {
      return NextResponse.json({
        error: '결제할 미납 리포트가 없습니다.',
        code: 'NO_UNPAID',
      }, { status: 400 });
    }

    // 각 리포트별 결제 시도
    const results: Array<{
      yearMonth: string;
      succeeded: boolean;
      paymentKey?: string;
      receiptUrl?: string | null;
      amount: number;
      errorCode?: string;
      errorMessage?: string;
    }> = [];

    for (const report of reports) {
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
      const orderId = generateOrderId(report.year_month, ptUserId);
      const orderName = `메가로드 수수료 ${report.year_month} (관리자 단건 실행)`;

      const { data: tx, error: txErr } = await serviceClient
        .from('payment_transactions')
        .insert({
          pt_user_id: ptUserId,
          monthly_report_id: report.id,
          billing_card_id: card.id,
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
        results.push({
          yearMonth: report.year_month,
          succeeded: false,
          amount: totalAmount,
          errorCode: 'TX_INSERT_FAILED',
          errorMessage: txErr?.message || '동일 리포트에 이미 진행 중인 결제 있음',
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
            stage: 'admin_charge_now_settlement',
            monthlyReportId: report.id,
            ptUserId,
            error: settleErr,
          });
        }

        await createNotification(serviceClient, {
          userId: ptUser.profile_id,
          type: 'fee_payment',
          title: '관리자 수동 결제 완료',
          message: `${report.year_month} 수수료 ${totalAmount.toLocaleString()}원이 결제되었습니다. 영수증 확인 가능합니다.`,
          link: '/my/report',
        });

        results.push({
          yearMonth: report.year_month,
          succeeded: true,
          paymentKey: result.paymentKey,
          receiptUrl: result.receipt?.url || null,
          amount: totalAmount,
        });
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
            failure_message: errObj.message || '관리자 단건 결제 실패',
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

        results.push({
          yearMonth: report.year_month,
          succeeded: false,
          amount: totalAmount,
          errorCode: code,
          errorMessage: failureLabel(code, errObj.message),
        });
      }
    }

    const succeededCount = results.filter((r) => r.succeeded).length;
    const failedCount = results.filter((r) => !r.succeeded).length;

    return NextResponse.json({
      success: succeededCount > 0,
      succeededCount,
      failedCount,
      results,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/[ptUserId]/charge-now error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
