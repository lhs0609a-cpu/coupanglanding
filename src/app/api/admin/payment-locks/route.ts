import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { calculateLockLevel } from '@/lib/payments/billing-constants';

/**
 * GET /api/admin/payment-locks
 * 결제 락이 걸려 있거나 곧 걸릴 PT 유저 목록.
 * - payment_overdue_since IS NOT NULL OR payment_lock_level > 0 OR payment_lock_exempt_until IS NOT NULL
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'partner')) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

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
        profile:profiles(full_name, email)
      `)
      .or('payment_overdue_since.not.is.null,payment_lock_level.gt.0,payment_lock_exempt_until.not.is.null,admin_override_level.not.is.null')
      .order('payment_overdue_since', { ascending: true, nullsFirst: false });

    if (error) throw error;

    // 각 유저의 "예상" lock level 계산 (cron이 돌기 전이라도 정확한 값을 보여주기 위해)
    const today = new Date();
    const todayDateStr = today.toISOString().slice(0, 10);
    const enriched = (ptUsers || []).map((u) => {
      const exemptActive = u.payment_lock_exempt_until && u.payment_lock_exempt_until > todayDateStr;
      const computedLevel = exemptActive ? 0 : calculateLockLevel(u.payment_overdue_since, today);
      return { ...u, computed_level: computedLevel };
    });

    return NextResponse.json({ users: enriched });
  } catch (err) {
    console.error('GET /api/admin/payment-locks error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
