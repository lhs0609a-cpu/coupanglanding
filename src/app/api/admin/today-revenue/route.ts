import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchTodaySales, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { requireAdminRole } from '@/lib/payments/admin-guard';

/**
 * GET /api/admin/today-revenue
 *
 * 연동된 모든 PT생의 "오늘(KST) 실시간 매출" 을 ordersheets API 로 즉시 조회.
 * Wing 대시보드 오늘 매출 과 근접.
 *
 * 병렬 호출이 아니라 순차 호출 (프록시 안정성) — PT생 1명당 약 3~5초.
 */
export const maxDuration = 300;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'read');
  if (!guard.ok) return guard.response;

  const serviceClient = await createServiceClient();
  const startedAt = Date.now();

  const { data: users, error } = await serviceClient
    .from('pt_users')
    .select('id, profile_id, coupang_vendor_id, coupang_access_key, coupang_secret_key, profile:profiles(full_name, email)')
    .eq('status', 'active')
    .eq('coupang_api_connected', true)
    .not('coupang_vendor_id', 'is', null)
    .not('coupang_access_key', 'is', null)
    .not('coupang_secret_key', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!users || users.length === 0) {
    return NextResponse.json({ success: true, totalSales: 0, perUser: [], message: '연동된 PT생 없음' });
  }

  let grandTotal = 0;
  const perUser: Array<Record<string, unknown>> = [];

  for (const u of users) {
    const profileRaw = u.profile as unknown;
    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
    const profileTyped = profile as { full_name?: string | null; email?: string | null } | null;

    try {
      const accessKey = await decryptPassword(u.coupang_access_key as string);
      const secretKey = await decryptPassword(u.coupang_secret_key as string);
      const result = await fetchTodaySales({
        vendorId: u.coupang_vendor_id as string,
        accessKey,
        secretKey,
      });
      grandTotal += result.totalSales;
      perUser.push({
        ptUserId: u.id,
        name: profileTyped?.full_name ?? '',
        email: profileTyped?.email ?? '',
        todaySales: result.totalSales,
        orderCount: result.orderCount,
        itemCount: result.itemCount,
        date: result.date,
      });
    } catch (err) {
      const msg = err instanceof CoupangApiError
        ? `${err.code || 'api'}: ${err.message}`
        : err instanceof Error ? err.message : String(err);
      perUser.push({
        ptUserId: u.id,
        name: profileTyped?.full_name ?? '',
        email: profileTyped?.email ?? '',
        todaySales: 0,
        error: msg.slice(0, 200),
      });
    }
  }

  return NextResponse.json({
    success: true,
    totalSales: grandTotal,
    userCount: users.length,
    elapsedMs: Date.now() - startedAt,
    perUser: perUser.sort((a, b) => (Number(b.todaySales) || 0) - (Number(a.todaySales) || 0)),
    fetchedAt: new Date().toISOString(),
  });
}
