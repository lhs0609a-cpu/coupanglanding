import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { runDesyncRecovery } from '@/lib/payments/desync-recovery';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

/**
 * POST /api/admin/payments/sync-locks
 * 관리자가 즉시 트리거하는 결제 동기화 자동 복구.
 *
 * 동작은 cron 과 동일: success tx 있는데 리포트 paid 아닌 케이스 자동 정정 + 락 해제.
 * 결과를 즉시 반환하므로 어드민이 화면에서 확인 가능.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const result = await runDesyncRecovery(serviceClient);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /api/admin/payments/sync-locks error:', err);
    void logSystemError({
      source: 'admin/payments/sync-locks',
      error: err,
      category: 'payment',
    }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
