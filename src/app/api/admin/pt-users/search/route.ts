import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';

/**
 * GET /api/admin/pt-users/search?q=...
 * 이메일 또는 이름으로 PT 사용자 검색. 최대 20개 반환.
 * 결제 예외 사전 설정 등에서 사용.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'read');
  if (!guard.ok) return guard.response;

  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const serviceClient = await createServiceClient();

  // profiles에서 이메일/이름 검색 → 그 중 PT 사용자
  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('id, full_name, email')
    .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
    .limit(30);

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const profileIds = profiles.map((p) => p.id);
  const { data: ptUsers } = await serviceClient
    .from('pt_users')
    .select('id, profile_id, status, payment_lock_level, payment_overdue_since, payment_lock_exempt_until, admin_override_level, first_billing_grace_until, is_test_account')
    .in('profile_id', profileIds)
    .neq('status', 'terminated')
    .limit(20);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const users = (ptUsers || []).map((u) => {
    const profile = profileMap.get(u.profile_id);
    return {
      id: u.id,
      profile_id: u.profile_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      status: u.status,
      payment_lock_level: u.payment_lock_level ?? 0,
      payment_overdue_since: u.payment_overdue_since,
      payment_lock_exempt_until: u.payment_lock_exempt_until,
      admin_override_level: u.admin_override_level,
      first_billing_grace_until: u.first_billing_grace_until,
      is_test_account: !!u.is_test_account,
    };
  });

  return NextResponse.json({ users });
}
