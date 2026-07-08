import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { effectiveSales } from '@/lib/supabase/types';

/**
 * 공개 · 익명 집계: 쿠팡 셀러 네트워크 실시간 현황 (공급사 랜딩 후킹용).
 *
 * 데이터 출처는 크론(coupang-revenue-sync)이 주기적으로 채우는
 * api_revenue_snapshots(셀러×월) 뿐 — 쿠팡 API 를 절대 호출하지 않는다(신규 호출 0).
 * 개인정보 없이 총합만 반환. 랜딩에서 폴링되므로 CDN/Edge 캐시로 보호.
 *
 * - activeSellerCount : "이번 달 판매 중인 셀러" (이번달 스냅샷 effectiveSales>0 인 고유 셀러 수)
 * - totalRevenue      : 전 기간 누적 거래액(GMV)
 * - thisMonthRevenue  : 이번 달 매출
 * - totalOrders       : 전 기간 누적 판매(주문) 건수
 * - growthPct         : 이번 달 vs 지난 달 매출 증감%
 * - monthlyTrend      : 최근 6개월 월별 매출 (스파크라인용)
 */

export const runtime = 'nodejs';
export const revalidate = 300; // 5분 — 스냅샷 크론 주기(4시간) 대비 충분히 신선

const PAGE_SIZE = 1000;

// KST 기준 'YYYY-MM' (offset 개월). Vercel 서버는 UTC 라 +9h 보정.
function ymKST(offset: number): string {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET() {
  try {
    const supabase = await createServiceClient();

    const thisMonth = ymKST(0);
    const lastMonth = ymKST(-1);
    const trendMonths = [ymKST(-5), ymKST(-4), ymKST(-3), ymKST(-2), ymKST(-1), ymKST(0)];

    let totalRevenue = 0;
    let totalOrders = 0;
    const revenueByMonth: Record<string, number> = {};
    const activeSellersThisMonth = new Set<string>();

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('api_revenue_snapshots')
        .select('pt_user_id, year_month, total_sales, total_sales_orders, order_count')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const row of data) {
        const es = effectiveSales(row);
        totalRevenue += es;
        totalOrders += Number(row.order_count) || 0;
        const ym = row.year_month as string;
        revenueByMonth[ym] = (revenueByMonth[ym] || 0) + es;
        if (ym === thisMonth && es > 0 && row.pt_user_id) {
          activeSellersThisMonth.add(row.pt_user_id as string);
        }
      }
      if (data.length < PAGE_SIZE) break;
    }

    const thisMonthRevenue = Math.round(revenueByMonth[thisMonth] || 0);
    const lastMonthRevenue = Math.round(revenueByMonth[lastMonth] || 0);
    const growthPct =
      lastMonthRevenue > 0
        ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : null;

    const monthlyTrend = trendMonths.map((ym) => ({
      ym,
      revenue: Math.round(revenueByMonth[ym] || 0),
    }));

    return NextResponse.json(
      {
        activeSellerCount: activeSellersThisMonth.size,
        totalRevenue: Math.round(totalRevenue),
        thisMonthRevenue,
        totalOrders,
        growthPct,
        monthlyTrend,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (err) {
    // 실패 시 랜딩 섹션이 조용히 숨겨지도록 null 반환(페이지 깨짐 방지).
    return NextResponse.json(
      { activeSellerCount: null, totalRevenue: null, error: err instanceof Error ? err.message : 'unknown' },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }
}
