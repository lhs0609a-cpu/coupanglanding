import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { getPreviousMonth, getReportTargetMonth } from '@/lib/utils/settlement';
import { requireAdminRole } from '@/lib/payments/admin-guard';

/**
 * POST /api/admin/coupang-revenue-sync
 *
 * 관리자가 매출 현황 페이지에서 "지금 동기화" 버튼 누를 때 호출.
 * 크론과 동일 로직을 즉시 실행. 대상: 연동된 모든 PT생, 현재월+직전월+전전월.
 * 특정 pt_user_id만 받아 단일 동기화도 지원 (body: { ptUserId?: string }).
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'read');
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const targetPtUserId: string | undefined = typeof body?.ptUserId === 'string' ? body.ptUserId : undefined;

  const serviceClient = await createServiceClient();
  const startedAt = Date.now();

  let query = serviceClient
    .from('pt_users')
    .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key')
    .eq('status', 'active')
    .eq('coupang_api_connected', true)
    .not('coupang_vendor_id', 'is', null)
    .not('coupang_access_key', 'is', null)
    .not('coupang_secret_key', 'is', null);

  if (targetPtUserId) {
    query = query.eq('id', targetPtUserId);
  }

  const { data: users, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json({
      success: true,
      totalUsers: 0,
      totalSynced: 0,
      totalFailed: 0,
      message: targetPtUserId ? 'API 미연동 사용자' : '연동된 PT생 없음',
    });
  }

  const targetMonth = getReportTargetMonth();
  const currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  const prevMonth = getPreviousMonth(targetMonth);
  const yearMonths = Array.from(new Set([currentMonth, targetMonth, prevMonth]));

  let successCount = 0;
  let failedCount = 0;
  const errorsSample: Array<{ ptUserId: string; yearMonth: string; error: string }> = [];

  // 병렬 처리 — 유저 단위로 CONCURRENCY 명 동시 실행. 이전 순차 처리로 90초+ 걸리던
  // 루프가 Vercel 타임아웃을 넘겨 클라이언트 UI 가 "실패" 로 오인하던 문제 해소.
  // 유저당 각 월은 순차(쿠팡 API per-vendor rate limit 보호).
  const CONCURRENCY = 5;

  type UserRow = {
    id: string;
    coupang_vendor_id: string | null;
    coupang_access_key: string | null;
    coupang_secret_key: string | null;
  };

  async function processUser(u: UserRow) {
    let accessKey: string;
    let secretKey: string;
    try {
      accessKey = await decryptPassword(u.coupang_access_key as string);
      secretKey = await decryptPassword(u.coupang_secret_key as string);
    } catch {
      for (const ym of yearMonths) {
        await upsertSnapshot(serviceClient, {
          pt_user_id: u.id,
          year_month: ym,
          total_sales: 0,
          total_commission: 0,
          total_shipping: 0,
          total_returns: 0,
          total_settlement: 0,
          item_count: 0,
          synced_at: new Date().toISOString(),
          sync_error: 'decrypt_failed',
        });
        failedCount++;
        errorsSample.push({ ptUserId: u.id, yearMonth: ym, error: 'decrypt_failed' });
      }
      return;
    }

    const credentials = {
      vendorId: u.coupang_vendor_id as string,
      accessKey,
      secretKey,
    };

    for (const ym of yearMonths) {
      try {
        // 정산 인식 매출 — 공식 revenue-history API. nextToken 페이지네이션 정확.
        //   이전엔 fetchOrderBasedSales(ordersheets) 사용했으나 쿠팡이 page 파라미터를 무시하고
        //   같은 50개 주문을 200페이지까지 반복 반환 → 매출 38배 부풀림. revenue-history 로 전환.
        const settlement = await fetchSettlementData(credentials, ym);
        await upsertSnapshot(serviceClient, {
          pt_user_id: u.id,
          year_month: ym,
          total_sales: settlement.totalSales,
          total_commission: settlement.totalCommission,
          total_shipping: settlement.totalShipping,
          total_returns: settlement.totalReturns,
          total_settlement: settlement.totalSettlement,
          item_count: settlement.items.length,
          synced_at: new Date().toISOString(),
          sync_error: null,
        });
        successCount++;
      } catch (err) {
        const message = err instanceof CoupangApiError
          ? `${err.code || 'api'}: ${err.message}`
          : err instanceof Error ? err.message : String(err);
        await upsertSnapshot(serviceClient, {
          pt_user_id: u.id,
          year_month: ym,
          total_sales: 0,
          total_commission: 0,
          total_shipping: 0,
          total_returns: 0,
          total_settlement: 0,
          item_count: 0,
          synced_at: new Date().toISOString(),
          sync_error: message.slice(0, 500),
        });
        failedCount++;
        if (errorsSample.length < 10) {
          errorsSample.push({ ptUserId: u.id, yearMonth: ym, error: message.slice(0, 200) });
        }
      }
    }
  }

  // CONCURRENCY 크기 배치로 나눠 Promise.allSettled
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(processUser));
  }

  return NextResponse.json({
    success: true,
    totalUsers: users.length,
    totalSynced: successCount,
    totalFailed: failedCount,
    yearMonths,
    elapsedMs: Date.now() - startedAt,
    errorsSample,
  });
}

type SnapshotInsert = {
  pt_user_id: string;
  year_month: string;
  total_sales: number;
  total_commission: number;
  total_shipping: number;
  total_returns: number;
  total_settlement: number;
  item_count: number;
  synced_at: string;
  sync_error: string | null;
};

async function upsertSnapshot(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  snapshot: SnapshotInsert,
) {
  const { error } = await serviceClient
    .from('api_revenue_snapshots')
    .upsert(snapshot, { onConflict: 'pt_user_id,year_month' });
  if (error) console.error('[admin/coupang-revenue-sync] upsert error:', error);
}
