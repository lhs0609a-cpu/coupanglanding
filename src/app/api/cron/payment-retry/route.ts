import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { retryTransaction } from '@/lib/payments/retry-runner';
import { kstDateStr } from '@/lib/payments/billing-constants';
import { logSettlementError } from '@/lib/payments/settlement-errors';

const ADVISORY_LOCK_KEY = 778001002; // auto-billing 과 별도 키 (safe integer 범위)

/**
 * GET /api/cron/payment-retry
 * 매일 19:00 UTC (≈ 04:00 KST 다음날) 실행.
 *
 * 동작:
 *   1) status=failed, is_final_failure=false, next_retry_at<=now() 인 모든 tx 조회
 *   2) 각 tx 에 대해 retryTransaction() 호출 — per-tx try/catch 로 격리 (한 건 실패가 전체 배치 중단하지 않도록)
 *   3) 동시 실행 방지용 advisory lock
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();

  const { data: lockOk } = await serviceClient.rpc('payment_try_advisory_lock', {
    p_key: ADVISORY_LOCK_KEY,
  });

  if (!lockOk) {
    return NextResponse.json(
      { error: 'payment-retry 가 이미 실행 중', processed: 0 },
      { status: 409 },
    );
  }

  try {
    const today = new Date();
    const todayDateStr = kstDateStr(today);
    const nowIso = today.toISOString();

    const { data: dueRetries, error: queryErr } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, billing_card_id, amount, penalty_amount, total_amount, retry_count, parent_transaction_id')
      .eq('status', 'failed')
      .eq('is_final_failure', false)
      .not('next_retry_at', 'is', null)
      .lte('next_retry_at', nowIso)
      .order('next_retry_at', { ascending: true });

    if (queryErr) throw queryErr;

    if (!dueRetries || dueRetries.length === 0) {
      return NextResponse.json({ success: true, message: '재시도 대상 없음', processed: 0 });
    }

    let processed = 0;
    let succeeded = 0;
    let finalFailed = 0;
    let stillRetrying = 0;
    let errored = 0;

    for (const tx of dueRetries) {
      processed++;
      try {
        const result = await retryTransaction(serviceClient, tx, todayDateStr);
        if (result.succeeded) succeeded++;
        else if (result.finalFailed) finalFailed++;
        else stillRetrying++;
      } catch (txErr) {
        // per-tx 격리 — 한 건 예외가 나머지를 중단시키지 않도록.
        errored++;
        await logSettlementError(serviceClient, {
          stage: 'payment_retry_loop',
          ptUserId: tx.pt_user_id,
          monthlyReportId: tx.monthly_report_id,
          error: txErr,
          detail: { txId: tx.id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      succeeded,
      finalFailed,
      stillRetrying,
      errored,
    });
  } catch (err) {
    console.error('cron/payment-retry error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  } finally {
    await serviceClient.rpc('payment_advisory_unlock', {
      p_key: ADVISORY_LOCK_KEY,
    });
  }
}
