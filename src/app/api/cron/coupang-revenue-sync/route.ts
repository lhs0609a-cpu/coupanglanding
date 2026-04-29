import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchSettlementData, CoupangApiError } from '@/lib/utils/coupang-api-client';
import { getPreviousMonth, getReportTargetMonth } from '@/lib/utils/settlement';

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

  const { data: users, error } = await serviceClient
    .from('pt_users')
    .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key')
    .eq('status', 'active')
    .eq('coupang_api_connected', true)
    .not('coupang_vendor_id', 'is', null)
    .not('coupang_access_key', 'is', null)
    .not('coupang_secret_key', 'is', null);

  if (error) {
    console.error('[coupang-revenue-sync] users query error:', error);
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
          synced_at: new Date().toISOString(),
          sync_error: 'decrypt_failed',
        });
      }
      return;
    }

    const credentials = {
      vendorId: user.coupang_vendor_id as string,
      accessKey,
      secretKey,
    };

    for (const ym of yearMonths) {
      try {
        // 매출인식 기준(공식 revenue-history API). 이전엔 fetchOrderBasedSales(ordersheets)를 썼으나
        // 쿠팡 ordersheets API 의 page 파라미터가 동일 페이지를 반복 반환 → 같은 주문이 200배 부풀려져 누적되는
        // 버그가 확인되어 제거. revenue-history 는 한 달 범위로 nextToken 기반 페이지네이션이 정확히 동작.
        const settlement = await fetchSettlementData(credentials, ym);
        await upsertSnapshot(serviceClient, {
          pt_user_id: user.id,
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
        results.push({
          ptUserId: user.id,
          yearMonth: ym,
          success: true,
          totalSales: settlement.totalSales,
          itemCount: settlement.items.length,
        });
      } catch (err) {
        const message = err instanceof CoupangApiError
          ? `${err.code || 'api'}: ${err.message}`
          : err instanceof Error ? err.message : String(err);
        console.error(`[coupang-revenue-sync] ${user.id} ${ym} failed:`, message);
        await upsertSnapshot(serviceClient, {
          pt_user_id: user.id,
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
        results.push({
          ptUserId: user.id,
          yearMonth: ym,
          success: false,
          error: message.slice(0, 200),
        });
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

  if (error) {
    console.error('[coupang-revenue-sync] upsert error:', error);
  }
}
