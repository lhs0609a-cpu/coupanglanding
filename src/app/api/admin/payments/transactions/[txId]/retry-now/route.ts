import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { retryTransaction } from '@/lib/payments/retry-runner';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { kstDateStr } from '@/lib/payments/billing-constants';
import { logSystemError } from '@/lib/utils/system-log';

/**
 * POST /api/admin/payments/transactions/[txId]/retry-now
 * 관리자가 24h 대기 없이 즉시 재시도 트리거.
 *
 * 대상: status='failed' AND is_final_failure=false 인 transaction.
 *   - is_final_failure=true 라도 관리자가 강제 시도하고 싶을 수 있으나,
 *     이 경우엔 새 카드 등록 후 다음 청구 사이클을 기다리거나
 *     별도 수동 결제 API(/api/payments/execute)를 사용해야 한다.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ txId: string }> }) {
  try {
    const { txId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 금전 영향 조치 — admin 전용 (partner 금지)
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const { data: tx } = await serviceClient
      .from('payment_transactions')
      .select('id, pt_user_id, monthly_report_id, billing_card_id, amount, penalty_amount, total_amount, retry_count, parent_transaction_id, status, is_final_failure')
      .eq('id', txId)
      .single();

    if (!tx) return NextResponse.json({ error: '트랜잭션 없음' }, { status: 404 });
    if (tx.status !== 'failed') {
      return NextResponse.json({ error: '실패 상태인 트랜잭션만 재시도 가능' }, { status: 400 });
    }
    if (tx.is_final_failure) {
      return NextResponse.json(
        { error: '최종 실패 상태입니다. 카드 재등록 후 다음 청구 사이클에 자동 결제됩니다.' },
        { status: 400 },
      );
    }

    const todayDateStr = kstDateStr();
    const result = await retryTransaction(serviceClient, tx, todayDateStr);

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('POST /api/admin/payments/transactions/[txId]/retry-now error:', err);
    void logSystemError({ source: 'admin/payments/transactions/[txId]/retry-now', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
