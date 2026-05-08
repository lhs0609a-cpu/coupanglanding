import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runDesyncRecovery } from '@/lib/payments/desync-recovery';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

/**
 * GET /api/cron/payment-desync-recovery
 * Vercel cron 매시간 실행. 결제 동기화 사고 자동 복구.
 *
 * 동작:
 *   payment_transactions.status='success' 인데 monthly_report.fee_payment_status 가
 *   paid 가 아닌 케이스를 탐지 → 자동 paid 마킹 + 락 해제 RPC 호출.
 *
 * 인증: Bearer CRON_SECRET 헤더 필수.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();
    const result = await runDesyncRecovery(serviceClient);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('cron/payment-desync-recovery error:', err);
    void logSystemError({
      source: 'cron/payment-desync-recovery',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
