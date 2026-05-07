import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { retryTransaction } from '@/lib/payments/retry-runner';
import { kstDateStr, MAX_PAYMENT_RETRY_COUNT } from '@/lib/payments/billing-constants';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 30;


const CRON_LOCK_KEY = 'cron:payment-retry';
// payment-retry 배치 최대 실행 예상 시간(초). 이 시간이 지나면 stale 로 간주하고 강탈 가능.
const CRON_LOCK_TTL_SECONDS = 30 * 60;

/**
 * GET /api/cron/payment-retry
 * 매일 19:00 UTC (≈ 04:00 KST 다음날) 실행.
 *
 * 동작:
 *   1) status=failed, is_final_failure=false, next_retry_at<=now() 인 모든 tx 조회
 *   2) 각 tx 에 대해 retryTransaction() 호출 — per-tx try/catch 로 격리 (한 건 실패가 전체 배치 중단하지 않도록)
 *   3) 동시 실행 방지: cron_locks 행 기반 TTL 락 (풀 무관)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();

  // pg_advisory_lock 은 세션 스코프라 PostgREST 풀과 함께 쓰면 unlock 이 다른
  // 커넥션으로 라우팅되어 무효화 → 락이 영구 잔존하는 버그가 있다.
  // 행 기반 TTL 락으로 교체.
  const { data: lockOk } = await serviceClient.rpc('cron_try_acquire_lock', {
    p_key: CRON_LOCK_KEY,
    p_ttl_seconds: CRON_LOCK_TTL_SECONDS,
    p_acquired_by: 'payment-retry',
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

    // retry_count < MAX 명시 — is_final_failure 토글이 누락된 좀비 행이 무한 재시도되는 것 방지
    const { data: dueRetries, error: queryErr } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, billing_card_id, amount, penalty_amount, total_amount, retry_count, parent_transaction_id')
      .eq('status', 'failed')
      .eq('is_final_failure', false)
      .lt('retry_count', MAX_PAYMENT_RETRY_COUNT)
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
    await serviceClient.rpc('cron_release_lock', { p_key: CRON_LOCK_KEY });
  }
}
