import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, fetchOrderBasedSales, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { getPreviousMonth, getReportTargetMonth } from '@/lib/utils/settlement';
import { requireAdminRole } from '@/lib/payments/admin-guard';

/**
 * GET /api/admin/revenue-sync-debug
 *
 * 쿠팡 매출 동기화 파이프라인의 전체 상태를 한 번에 진단.
 * 관리자가 브라우저에서 이 URL 열면 JSON 으로 전부 보여줌.
 *
 * 보여주는 내용:
 *   1) 환경변수 설정 상태 (PROXY_URL, PROXY_SECRET, CRON_SECRET)
 *   2) PT 사용자 필터링 결과 — 왜 대상에서 빠지는지 이유별 카운트
 *   3) 각 연동 PT생의 credential 상태 + 최근 스냅샷 + 최근 에러
 *   4) ?sync=1 쿼리 붙이면 실제 동기화까지 실행하고 결과 포함
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'read');
  if (!guard.ok) return guard.response;

  const runSync = request.nextUrl.searchParams.get('sync') === '1';
  const serviceClient = await createServiceClient();

  // 1) 환경변수
  const env = {
    COUPANG_PROXY_URL: process.env.COUPANG_PROXY_URL ? `${process.env.COUPANG_PROXY_URL.slice(0, 30)}...` : '(미설정 — 직접 호출 모드)',
    COUPANG_PROXY_SECRET: process.env.COUPANG_PROXY_SECRET ? '(설정됨)' : process.env.PROXY_SECRET ? '(PROXY_SECRET로 설정됨)' : '(미설정)',
    CRON_SECRET: process.env.CRON_SECRET ? '(설정됨)' : '(미설정 — 크론 호출 시 401)',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? '(설정됨)' : '(미설정 — 복호화 불가)',
  };

  // 2) 전체 PT 사용자 상태 스냅샷
  const { data: allUsers } = await serviceClient
    .from('pt_users')
    .select('id, status, coupang_api_connected, coupang_vendor_id, coupang_access_key, coupang_secret_key, profile_id');

  const totalPtUsers = allUsers?.length ?? 0;
  const byStatus: Record<string, number> = {};
  for (const u of allUsers || []) byStatus[u.status || 'null'] = (byStatus[u.status || 'null'] || 0) + 1;

  const connectedCount = (allUsers || []).filter(u => u.coupang_api_connected).length;
  const eligibleUsers = (allUsers || []).filter(u =>
    u.status === 'active'
    && u.coupang_api_connected === true
    && !!u.coupang_vendor_id
    && !!u.coupang_access_key
    && !!u.coupang_secret_key,
  );

  const notEligibleReasons: Record<string, number> = {};
  for (const u of allUsers || []) {
    if (u.status !== 'active') { notEligibleReasons[`status=${u.status}`] = (notEligibleReasons[`status=${u.status}`] || 0) + 1; continue; }
    if (!u.coupang_api_connected) { notEligibleReasons['api_connected=false'] = (notEligibleReasons['api_connected=false'] || 0) + 1; continue; }
    if (!u.coupang_vendor_id) { notEligibleReasons['vendor_id=null'] = (notEligibleReasons['vendor_id=null'] || 0) + 1; continue; }
    if (!u.coupang_access_key) { notEligibleReasons['access_key=null'] = (notEligibleReasons['access_key=null'] || 0) + 1; continue; }
    if (!u.coupang_secret_key) { notEligibleReasons['secret_key=null'] = (notEligibleReasons['secret_key=null'] || 0) + 1; continue; }
  }

  // 3) 각 eligible 사용자의 스냅샷 / 에러 상태
  const eligibleIds = eligibleUsers.map(u => u.id);
  const profileIds = eligibleUsers.map(u => u.profile_id);

  const [profilesRes, snapshotsRes] = await Promise.all([
    profileIds.length > 0
      ? serviceClient.from('profiles').select('id, email, full_name').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    eligibleIds.length > 0
      ? serviceClient.from('api_revenue_snapshots').select('*').in('pt_user_id', eligibleIds).order('synced_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map<string, { email: string; full_name: string }>();
  for (const p of (profilesRes.data || [])) profileMap.set(p.id as string, { email: p.email as string, full_name: p.full_name as string });

  const snapsByUser = new Map<string, Array<Record<string, unknown>>>();
  for (const s of (snapshotsRes.data || [])) {
    const arr = snapsByUser.get(s.pt_user_id as string) || [];
    arr.push(s as Record<string, unknown>);
    snapsByUser.set(s.pt_user_id as string, arr);
  }

  const userReport = eligibleUsers.map(u => {
    const profile = profileMap.get(u.profile_id) || { email: '(unknown)', full_name: '' };
    const snaps = snapsByUser.get(u.id) || [];
    const latest = snaps[0];
    return {
      email: profile.email,
      name: profile.full_name,
      ptUserId: u.id,
      vendorId: u.coupang_vendor_id,
      snapshotCount: snaps.length,
      latestSyncedAt: latest?.synced_at || null,
      latestError: latest?.sync_error || null,
      allMonths: snaps.map(s => ({
        ym: s.year_month,
        sales: Number(s.total_sales) || 0,
        items: Number(s.item_count) || 0,
        syncedAt: s.synced_at,
        error: s.sync_error,
      })),
    };
  });

  // 4) sync 실행 (?sync=1)
  let syncResult: Record<string, unknown> | null = null;
  if (runSync) {
    const startedAt = Date.now();
    const targetMonth = getReportTargetMonth();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = getPreviousMonth(targetMonth);
    const yearMonths = Array.from(new Set([currentMonth, targetMonth, prevMonth]));

    const perUser: Array<Record<string, unknown>> = [];
    for (const u of eligibleUsers) {
      const profile = profileMap.get(u.profile_id) || { email: '(unknown)', full_name: '' };
      const userLog: Record<string, unknown> = { email: profile.email, ptUserId: u.id, monthResults: [] };
      let accessKey: string, secretKey: string;
      try {
        accessKey = await decryptPassword(u.coupang_access_key as string);
        secretKey = await decryptPassword(u.coupang_secret_key as string);
      } catch (err) {
        userLog.decryptError = err instanceof Error ? err.message : String(err);
        perUser.push(userLog);
        continue;
      }
      const creds = { vendorId: u.coupang_vendor_id as string, accessKey, secretKey };
      for (const ym of yearMonths) {
        try {
          // 기존: 정산 인식 기준 매출
          const s = await fetchSettlementData(creds, ym);
          // 신규: Wing 대시보드 기준 (주문 기반) 매출 — 병행 호출
          let orderBased: Awaited<ReturnType<typeof fetchOrderBasedSales>> | null = null;
          let orderBasedExcludingCancelled: Awaited<ReturnType<typeof fetchOrderBasedSales>> | null = null;
          try {
            orderBased = await fetchOrderBasedSales(creds, ym);
          } catch (e) {
            console.warn(`[debug] order-based fetch failed ${u.id} ${ym}:`, e);
          }
          try {
            orderBasedExcludingCancelled = await fetchOrderBasedSales(creds, ym, { excludeCancelled: true });
          } catch { /* ignore */ }

          await serviceClient.from('api_revenue_snapshots').upsert({
            pt_user_id: u.id, year_month: ym,
            total_sales: s.totalSales, total_commission: s.totalCommission,
            total_shipping: s.totalShipping, total_returns: s.totalReturns,
            total_settlement: s.totalSettlement, item_count: s.items.length,
            synced_at: new Date().toISOString(), sync_error: null,
          }, { onConflict: 'pt_user_id,year_month' });

          (userLog.monthResults as Array<Record<string, unknown>>).push({
            ym,
            settlementBased: { sales: s.totalSales, items: s.items.length },
            orderBased: orderBased ? { sales: orderBased.totalSales, orders: orderBased.orderCount, items: orderBased.itemCount } : null,
            orderBasedNoCancel: orderBasedExcludingCancelled ? { sales: orderBasedExcludingCancelled.totalSales, orders: orderBasedExcludingCancelled.orderCount } : null,
            ok: true,
          });
        } catch (err) {
          const msg = err instanceof CoupangApiError ? `${err.code || 'api'}: ${err.message}` : err instanceof Error ? err.message : String(err);
          await serviceClient.from('api_revenue_snapshots').upsert({
            pt_user_id: u.id, year_month: ym,
            total_sales: 0, total_commission: 0, total_shipping: 0, total_returns: 0, total_settlement: 0, item_count: 0,
            synced_at: new Date().toISOString(), sync_error: msg.slice(0, 500),
          }, { onConflict: 'pt_user_id,year_month' });
          (userLog.monthResults as Array<Record<string, unknown>>).push({ ym, ok: false, error: msg.slice(0, 300) });
        }
      }
      perUser.push(userLog);
    }
    syncResult = {
      elapsedMs: Date.now() - startedAt,
      yearMonths,
      perUser,
    };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env,
    summary: {
      totalPtUsers,
      byStatus,
      connectedCount,
      eligibleCount: eligibleUsers.length,
      notEligibleReasons,
    },
    eligibleUsers: userReport,
    syncResult,
    hint: syncResult
      ? '위 perUser[].monthResults 에서 error가 있으면 쿠팡 API 응답 문제. ok:true 이고 sales>0 이면 성공.'
      : '실제 동기화도 같이 실행하려면 ?sync=1 을 URL 뒤에 붙여서 다시 호출하세요.',
  });
}
