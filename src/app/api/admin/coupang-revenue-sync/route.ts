import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, fetchOrderBasedSales, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { getPreviousMonth, getReportTargetMonth } from '@/lib/utils/settlement';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { classifyError } from '@/lib/utils/coupang-circuit-breaker';
import { logSystemError, logSystemSuccess } from '@/lib/utils/system-log';

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
          total_sales_orders: 0,
          item_count_orders: 0,
          order_count: 0,
          synced_at: new Date().toISOString(),
          sync_error: 'decrypt_failed',
          orders_sync_error: 'decrypt_failed',
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
      // settlement(정산 인식) + orders(주문) 둘 다 호출.
      // 신규 셀러 정산 지연으로 settlement=0 인 경우 orders 가 매출을 채운다.
      let settlement: Awaited<ReturnType<typeof fetchSettlementData>> | null = null;
      let settlementError: string | null = null;
      try {
        settlement = await fetchSettlementData(credentials, ym);
      } catch (err) {
        settlementError = err instanceof CoupangApiError
          ? `${err.code || 'api'}: ${err.message}`
          : err instanceof Error ? err.message : String(err);
      }

      let orderBased: Awaited<ReturnType<typeof fetchOrderBasedSales>> | null = null;
      let ordersError: string | null = null;
      try {
        orderBased = await fetchOrderBasedSales(credentials, ym);
      } catch (err) {
        ordersError = err instanceof CoupangApiError
          ? `${err.code || 'api'}: ${err.message}`
          : err instanceof Error ? err.message : String(err);
      }

      await upsertSnapshot(serviceClient, {
        pt_user_id: u.id,
        year_month: ym,
        total_sales: settlement?.totalSales ?? 0,
        total_commission: settlement?.totalCommission ?? 0,
        total_shipping: settlement?.totalShipping ?? 0,
        total_returns: settlement?.totalReturns ?? 0,
        total_settlement: settlement?.totalSettlement ?? 0,
        item_count: settlement?.items.length ?? 0,
        total_sales_orders: orderBased?.totalSales ?? 0,
        item_count_orders: orderBased?.itemCount ?? 0,
        order_count: orderBased?.orderCount ?? 0,
        synced_at: new Date().toISOString(),
        sync_error: settlementError ? settlementError.slice(0, 500) : null,
        orders_sync_error: ordersError ? ordersError.slice(0, 500) : null,
      });

      if (!settlementError && !ordersError) {
        successCount++;
      } else if (settlementError && ordersError) {
        // 둘 다 실패 — 사고 처리
        failedCount++;
        const message = settlementError;
        const reason = classifyError(message);
        void logSystemError({
          source: 'admin/coupang-revenue-sync',
          error: `settlement: ${settlementError}; orders: ${ordersError}`,
          context: {
            ptUserId: u.id,
            vendorId: u.coupang_vendor_id,
            yearMonth: ym,
            reason,
          },
          userId: u.id,
        }).catch(() => {});
        if (errorsSample.length < 10) {
          errorsSample.push({ ptUserId: u.id, yearMonth: ym, error: message.slice(0, 200) });
        }
      } else {
        // 부분 실패 — 한 쪽은 성공했으므로 success로 간주 (매출은 살림)
        successCount++;
      }
    }
  }

  // CONCURRENCY 크기 배치로 나눠 Promise.allSettled
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(processUser));
  }

  // 완전 성공 — 미해결 사고 자동 해결
  if (failedCount === 0 && successCount > 0) {
    await logSystemSuccess({ source: 'admin/coupang-revenue-sync' });
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
  total_sales_orders: number;
  item_count_orders: number;
  order_count: number;
  synced_at: string;
  sync_error: string | null;
  orders_sync_error: string | null;
};

async function upsertSnapshot(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  snapshot: SnapshotInsert,
) {
  const { error } = await serviceClient
    .from('api_revenue_snapshots')
    .upsert(snapshot, { onConflict: 'pt_user_id,year_month' });
  if (error) {
    console.error('[admin/coupang-revenue-sync] upsert error:', error);
    void logSystemError({ source: 'admin/coupang-revenue-sync', error, context: { stage: 'upsert' } }).catch(() => {});
  }
}
