import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, fetchOrderBasedSales, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { getPreviousMonth, getReportTargetMonth } from '@/lib/utils/settlement';
import { recordCoupangApiFailure, clearCoupangApiBlock, classifyError } from '@/lib/utils/coupang-circuit-breaker';
import { logSystemError, logSystemSuccess } from '@/lib/utils/system-log';

/**
 * GET /api/cron/coupang-revenue-sync
 *
 * 연동된 PT생의 쿠팡 매출 데이터를 주기적으로 수집해
 * api_revenue_snapshots 테이블에 upsert.
 *
 * 수집 범위: 현재 월(진행 중), 직전 월(보고 대상 월), 그 전 월(지연 제출 대비)
 * 인증: Vercel Cron은 Authorization 헤더에 CRON_SECRET 전달. 수동 호출 시 Bearer 토큰 필수.
 */
export const maxDuration = 300;

interface SyncResult {
  ptUserId: string;
  yearMonth: string;
  success: boolean;
  totalSales?: number;
  itemCount?: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return runSync();
}

/** POST — 관리자 수동 트리거 (admin-guard 필요시 별도 래퍼에서 사용) */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

async function runSync() {
  const serviceClient = await createServiceClient();
  const startedAt = Date.now();

  // circuit breaker — IP/키 차단된 셀러는 backoff 시각 전까지 skip (cron 비용 폭증 차단)
  const nowIso = new Date().toISOString();
  const { data: users, error } = await serviceClient
    .from('pt_users')
    .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key')
    .eq('status', 'active')
    .eq('coupang_api_connected', true)
    .not('coupang_vendor_id', 'is', null)
    .not('coupang_access_key', 'is', null)
    .not('coupang_secret_key', 'is', null)
    .or(`coupang_api_blocked_until.is.null,coupang_api_blocked_until.lt.${nowIso}`);

  if (error) {
    console.error('[coupang-revenue-sync] users query error:', error);
    void logSystemError({ source: 'cron/coupang-revenue-sync', error: error }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json({ success: true, synced: 0, message: '연동된 PT생 없음' });
  }

  const targetMonth = getReportTargetMonth();
  const currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  const prevMonth = getPreviousMonth(targetMonth);
  const yearMonths = Array.from(new Set([currentMonth, targetMonth, prevMonth]));

  const results: SyncResult[] = [];

  // 병렬 처리 — admin 동기화 라우트와 동일. Vercel 타임아웃 안에 완료되도록 5명 동시.
  const CONCURRENCY = 5;

  type UserRow = {
    id: string;
    coupang_vendor_id: string | null;
    coupang_access_key: string | null;
    coupang_secret_key: string | null;
  };

  async function processUser(user: UserRow) {
    let accessKey: string;
    let secretKey: string;
    try {
      accessKey = await decryptPassword(user.coupang_access_key as string);
      secretKey = await decryptPassword(user.coupang_secret_key as string);
    } catch (err) {
      console.error(`[coupang-revenue-sync] decrypt failed for ${user.id}:`, err);
      void logSystemError({ source: 'cron/coupang-revenue-sync', error: err }).catch(() => {});
      for (const ym of yearMonths) {
        results.push({
          ptUserId: user.id,
          yearMonth: ym,
          success: false,
          error: 'decrypt_failed',
        });
        await upsertSnapshot(serviceClient, {
          pt_user_id: user.id,
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
      }
      return;
    }

    const credentials = {
      vendorId: user.coupang_vendor_id as string,
      accessKey,
      secretKey,
    };

    let userBlocked = false; // 한 셀러가 첫 월에 IP 차단 받으면 나머지 월 호출 skip (비용 절감)
    for (const ym of yearMonths) {
      if (userBlocked) {
        results.push({ ptUserId: user.id, yearMonth: ym, success: false, error: 'skipped (circuit breaker)' });
        continue;
      }

      // 두 API 병행 호출 — settlement(정산 인식) + orders(주문 기준).
      // 신규 셀러는 정산이 ~15일 지연되므로 settlement=0 인데 orders>0 인 케이스가 많다.
      // 둘 다 저장하고, 표시 시 GREATEST 로 누락을 막는다.
      let settlement: Awaited<ReturnType<typeof fetchSettlementData>> | null = null;
      let settlementError: string | null = null;
      try {
        settlement = await fetchSettlementData(credentials, ym);
      } catch (err) {
        settlementError = err instanceof CoupangApiError
          ? `${err.code || 'api'}: ${err.message}`
          : err instanceof Error ? err.message : String(err);
        console.error(`[coupang-revenue-sync] ${user.id} ${ym} settlement failed:`, settlementError);
      }

      let orderBased: Awaited<ReturnType<typeof fetchOrderBasedSales>> | null = null;
      let ordersError: string | null = null;
      try {
        orderBased = await fetchOrderBasedSales(credentials, ym);
      } catch (err) {
        ordersError = err instanceof CoupangApiError
          ? `${err.code || 'api'}: ${err.message}`
          : err instanceof Error ? err.message : String(err);
        console.error(`[coupang-revenue-sync] ${user.id} ${ym} orders failed:`, ordersError);
      }

      // 둘 다 실패하면 circuit breaker 등록 + 다음 월 skip.
      // 한 쪽만 실패하면 그쪽 에러만 기록하고 진행 (매출 누락 < 부분 누락).
      const bothFailed = !!settlementError && !!ordersError;

      await upsertSnapshot(serviceClient, {
        pt_user_id: user.id,
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

      if (bothFailed) {
        const message = settlementError!;
        const reason = classifyError(message);
        void logSystemError({
          source: 'cron/coupang-revenue-sync',
          error: `settlement: ${settlementError}; orders: ${ordersError}`,
          context: {
            ptUserId: user.id,
            vendorId: user.coupang_vendor_id,
            yearMonth: ym,
            reason,
          },
          userId: user.id,
        }).catch(() => {});
        results.push({
          ptUserId: user.id,
          yearMonth: ym,
          success: false,
          error: message.slice(0, 200),
        });
        await recordCoupangApiFailure(serviceClient, user.id, message);
        userBlocked = true;
      } else {
        // 적어도 한 쪽은 성공
        const effectiveSales = Math.max(settlement?.totalSales ?? 0, orderBased?.totalSales ?? 0);
        const effectiveItems = Math.max(settlement?.items.length ?? 0, orderBased?.itemCount ?? 0);
        results.push({
          ptUserId: user.id,
          yearMonth: ym,
          success: true,
          totalSales: effectiveSales,
          itemCount: effectiveItems,
        });
        await clearCoupangApiBlock(serviceClient, user.id);
      }
    }
  }

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(processUser));
  }

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.length - successCount;
  const elapsed = Date.now() - startedAt;

  // 완전 성공 — 미해결 사고 자동 해결
  if (failedCount === 0 && successCount > 0) {
    await logSystemSuccess({ source: 'cron/coupang-revenue-sync' });
  }

  return NextResponse.json({
    success: true,
    totalUsers: users.length,
    totalSynced: successCount,
    totalFailed: failedCount,
    yearMonths,
    elapsedMs: elapsed,
    results: results.slice(0, 100),
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
    console.error('[coupang-revenue-sync] upsert error:', error);
    void logSystemError({ source: 'cron/coupang-revenue-sync', error, context: { stage: 'upsert' } }).catch(() => {});
  }
}
