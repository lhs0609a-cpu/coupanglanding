import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { effectiveSales } from '@/lib/supabase/types';

/**
 * 공개 · 익명 집계: 쿠팡PT 셀러 누적 총매출.
 *
 * 근거 데이터는 이미 크론(coupang-revenue-sync)이 주기적으로 채우는
 * api_revenue_snapshots(월별 셀러 스냅샷)뿐 — 이 엔드포인트는 쿠팡 API 를
 * 절대 호출하지 않는다(신규 호출 0). 각 (셀러, 월) 스냅샷의 effectiveSales
 * (정산확정 vs 주문 중 큰 값)를 전 기간 합산해 "누적 총매출"을 만든다.
 *
 * 개인정보 없음(셀러명/개별액 미노출), 총합·셀러수만 반환.
 * 랜딩 페이지에서 매 방문 호출되므로 CDN/Edge 캐시(s-maxage)로 보호.
 */

export const runtime = 'nodejs';
// 5분 캐시 — 스냅샷은 크론 주기(4시간)로만 바뀌므로 충분히 신선하고 부하도 낮다.
export const revalidate = 300;

const PAGE_SIZE = 1000;

export async function GET() {
  try {
    const supabase = await createServiceClient();

    // api_revenue_snapshots 전 행을 페이지네이션으로 순회하며 effectiveSales 합산.
    // (PostgREST 기본 1000행 상한 → 범위 페이징으로 누락 방지)
    let totalRevenue = 0;
    let rowCount = 0;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('api_revenue_snapshots')
        .select('total_sales, total_sales_orders')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const row of data) {
        totalRevenue += effectiveSales(row);
      }
      rowCount += data.length;
      if (data.length < PAGE_SIZE) break;
    }

    // 참여 셀러 수 — 쿠팡 연동 완료된 활성 셀러 카운트(개별 매출은 미노출).
    const { count: sellerCount } = await supabase
      .from('pt_users')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('coupang_api_connected', true);

    return NextResponse.json(
      {
        totalRevenue: Math.round(totalRevenue),
        sellerCount: sellerCount ?? 0,
        snapshotCount: rowCount,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          // 브라우저 5분, CDN 5분 + 그 후 10분간 stale 허용(백그라운드 갱신).
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (err) {
    // 실패해도 랜딩 위젯이 조용히 숨겨지도록 200 + null 로 응답(페이지 깨짐 방지).
    return NextResponse.json(
      { totalRevenue: null, sellerCount: null, error: err instanceof Error ? err.message : 'unknown' },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }
}
