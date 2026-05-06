import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchTodaySales, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { recordCoupangApiFailure, clearCoupangApiBlock } from '@/lib/utils/coupang-circuit-breaker';

/**
 * GET /api/admin/today-revenue
 *
 * 연동된 모든 PT생의 "오늘(KST) 실시간 매출" 을 ordersheets API 로 즉시 조회.
 * Wing 대시보드 오늘 매출 과 근접.
 *
 * 비용 가드:
 *   - circuit breaker — IP/auth 차단된 셀러 자동 skip
 *   - soft deadline 75s — 90s maxDuration 안에 graceful exit (이전 300s 비용 폭증 원인)
 *   - admin 페이지 15분 폴링 × 96회/일 시 셀러당 30s timeout × 15명 = 450s (이전 wall)
 *     이제 75s 도달 시 미처리 셀러는 다음 폴링에서 처리.
 */
export const maxDuration = 90;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'read');
  if (!guard.ok) return guard.response;

  const serviceClient = await createServiceClient();
  const startedAt = Date.now();
  const SOFT_DEADLINE_MS = 75_000;

  // circuit breaker — IP 차단 셀러는 query 단계에서 skip
  const nowIso = new Date().toISOString();
  const { data: users, error } = await serviceClient
    .from('pt_users')
    .select('id, profile_id, coupang_vendor_id, coupang_access_key, coupang_secret_key, profile:profiles(full_name, email)')
    .eq('status', 'active')
    .eq('coupang_api_connected', true)
    .not('coupang_vendor_id', 'is', null)
    .not('coupang_access_key', 'is', null)
    .not('coupang_secret_key', 'is', null)
    .or(`coupang_api_blocked_until.is.null,coupang_api_blocked_until.lt.${nowIso}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!users || users.length === 0) {
    return NextResponse.json({ success: true, totalSales: 0, perUser: [], message: '연동된 PT생 없음' });
  }

  let grandTotal = 0;
  const perUser: Array<Record<string, unknown>> = [];
  let timedOut = false;

  for (const u of users) {
    // soft deadline 도달 시 미처리 셀러는 다음 폴링에서 처리
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) {
      timedOut = true;
      console.log(`[today-revenue] soft deadline 도달 — ${perUser.length}/${users.length} 처리 후 중단`);
      break;
    }
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
      // 성공 시 circuit breaker 해제
      await clearCoupangApiBlock(serviceClient, u.id as string);
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
      // IP/auth 영구 오류는 circuit breaker 등록 → 다음 폴링부터 skip
      await recordCoupangApiFailure(serviceClient, u.id as string, msg);
    }
  }

  return NextResponse.json({
    success: true,
    totalSales: grandTotal,
    userCount: users.length,
    processedCount: perUser.length,
    timedOut,
    elapsedMs: Date.now() - startedAt,
    perUser: perUser.sort((a, b) => (Number(b.todaySales) || 0) - (Number(a.todaySales) || 0)),
    fetchedAt: new Date().toISOString(),
  });
}
