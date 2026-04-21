import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { calculateLockLevel, kstDateStr } from '@/lib/payments/billing-constants';
import { requireAdminRole } from '@/lib/payments/admin-guard';

/**
 * GET /api/admin/payment-locks
 * 결제 락이 걸려 있거나 곧 걸릴 PT 유저 목록.
 * signed 계약만 대상 (terminated/draft 은 제외) — overview 와 일관화.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const { data: ptUsers, error } = await serviceClient
      .from('pt_users')
      .select(`
        id,
        profile_id,
        payment_overdue_since,
        payment_lock_level,
        payment_lock_exempt_until,
        admin_override_level,
        payment_retry_in_progress,
        profile:profiles(full_name, email),
        contracts!inner(status)
      `)
      .eq('contracts.status', 'signed')
      .or('payment_overdue_since.not.is.null,payment_lock_level.gt.0,payment_lock_exempt_until.not.is.null,admin_override_level.not.is.null')
      .order('payment_overdue_since', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const today = new Date();
    const todayDateStr = kstDateStr(today);
    const enriched = (ptUsers || []).map((u) => {
      const exemptActive = u.payment_lock_exempt_until && u.payment_lock_exempt_until > todayDateStr;
      const computedLevel = exemptActive
        ? 0
        : calculateLockLevel(u.payment_overdue_since, today, {
            retryInProgress: !!u.payment_retry_in_progress,
          });
      return { ...u, computed_level: computedLevel };
    });

    return NextResponse.json({ users: enriched });
  } catch (err) {
    console.error('GET /api/admin/payment-locks error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
