import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logSettlementError } from '@/lib/payments/settlement-errors';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

/**
 * GET /api/cron/payment-stuck-monitor
 *
 * 매일 1회 실행. 7일 이상 stuck 한 결제 동기화 사고를 감지해서 알림.
 *
 * stuck 정의:
 *   - monthly_report.fee_payment_status != 'paid'
 *   - + 같은 monthly_report 에 status='failed' 인 tx 존재
 *   - + tx.created_at 이 7일+ 전
 *   - + 그 tx 가 토스 정산 페이지에는 DONE 일 수 있음 (사용자/관리자가 모를 수 있음)
 *
 * 동작:
 *   - 모든 stuck 케이스를 settlement_errors 에 'stuck_alert' 로 기록
 *   - 같은 stuck 케이스에 대해 24h 내 재기록 안함 (스팸 방지)
 *   - 관리자는 errors 페이지에서 일괄 확인 → /sync-locks 또는 /force-recover-all 트리거
 *
 * 인증: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1) 7일+ 전에 만들어진 failed/pending tx (toss_order_id 있는 것만)
    const { data: oldFailedTxs, error: scanErr } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, toss_order_id, total_amount, status, failure_code, failure_message, created_at, is_final_failure')
      .in('status', ['failed', 'pending'])
      .lte('created_at', sevenDaysAgo)
      .not('toss_order_id', 'is', null)
      .limit(500);

    if (scanErr) throw scanErr;

    if (!oldFailedTxs || oldFailedTxs.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        stuck: 0,
        alerted: 0,
      });
    }

    // 2) 그 중 monthly_report 가 아직 미납인 것만 (paid 면 이미 다른 tx 로 해결됨)
    const reportIds = Array.from(new Set(oldFailedTxs.map((t) => t.monthly_report_id).filter(Boolean) as string[]));
    if (reportIds.length === 0) {
      return NextResponse.json({ success: true, scanned: oldFailedTxs.length, stuck: 0, alerted: 0 });
    }

    const { data: unpaidReports } = await serviceClient
      .from('monthly_reports')
      .select('id')
      .in('id', reportIds)
      .neq('fee_payment_status', 'paid');

    const unpaidReportIdSet = new Set((unpaidReports || []).map((r) => r.id as string));
    const stuckTxs = oldFailedTxs.filter((t) => t.monthly_report_id && unpaidReportIdSet.has(t.monthly_report_id as string));

    if (stuckTxs.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: oldFailedTxs.length,
        stuck: 0,
        alerted: 0,
      });
    }

    // 3) 24h 내 이미 같은 tx 에 stuck_alert 가 있으면 skip (스팸 방지)
    const stuckTxIds = stuckTxs.map((t) => t.id as string);
    const { data: recentAlerts } = await serviceClient
      .from('payment_settlement_errors')
      .select('detail')
      .eq('stage', 'stuck_alert')
      .gte('created_at', oneDayAgo)
      .limit(1000);

    const alertedTxIds = new Set<string>();
    for (const a of (recentAlerts || []) as Array<{ detail: Record<string, unknown> }>) {
      const txId = a.detail?.txId as string | undefined;
      if (txId) alertedTxIds.add(txId);
    }
    const newStuck = stuckTxs.filter((t) => !alertedTxIds.has(t.id as string));

    // 4) settlement_errors 에 일괄 기록
    let alerted = 0;
    for (const tx of newStuck) {
      const ageDays = Math.round(
        (Date.now() - new Date(tx.created_at as string).getTime()) / (24 * 60 * 60 * 1000),
      );
      await logSettlementError(serviceClient, {
        stage: 'stuck_alert',
        monthlyReportId: tx.monthly_report_id as string,
        ptUserId: tx.pt_user_id as string,
        error: {
          code: 'STUCK_DESYNC',
          message:
            `tx ${tx.id} 가 ${ageDays}일째 ${tx.status}/${tx.failure_code ?? 'no_code'} 상태로 미복구. ` +
            `토스 정산에는 DONE 일 수 있음 — /api/admin/payments/force-recover-all 트리거 권장.`,
        },
        detail: {
          txId: tx.id,
          orderId: tx.toss_order_id,
          amount: tx.total_amount,
          isFinal: tx.is_final_failure,
          ageDays,
          severity: 'STUCK_7D_PLUS',
          actionable: 'POST /api/admin/payments/force-recover-all { ptUserId }',
        },
      });
      alerted++;
    }

    if (alerted > 0) {
      console.warn(
        `[payment-stuck-monitor] ⚠️ ${alerted}건의 7일+ stuck tx 발견. ` +
        `settlement_errors 테이블 stage=stuck_alert 확인 + force-recover-all 트리거 권장.`,
      );
    }

    return NextResponse.json({
      success: true,
      scanned: oldFailedTxs.length,
      stuck: stuckTxs.length,
      alerted,
      sampleStuck: newStuck.slice(0, 5).map((t) => ({
        txId: t.id,
        orderId: t.toss_order_id,
        amount: t.total_amount,
        failureCode: t.failure_code,
        ageDays: Math.round(
          (Date.now() - new Date(t.created_at as string).getTime()) / (24 * 60 * 60 * 1000),
        ),
      })),
    });
  } catch (err) {
    console.error('cron/payment-stuck-monitor error:', err);
    void logSystemError({
      source: 'cron/payment-stuck-monitor',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
