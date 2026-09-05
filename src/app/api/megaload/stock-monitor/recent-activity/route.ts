import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 20;

/**
 * GET /api/megaload/stock-monitor/recent-activity
 * "실시간 감지" 신호등 + "방금 ○○ 확인완료" 피드용 경량 조회.
 *
 * 도우미(PC 프로그램)가 결과를 제출할 때마다 last_checked_at 이 갱신된다.
 * 그 최신순 상위 N개를 피드로, 최근 5분/1시간 체크 건수를 감지 활성도로 반환한다.
 * (개별 상태변경 로그가 아니라 "확인이 방금 돌았는지"를 사용자가 눈으로 보게 하는 용도.)
 *
 * 반환:
 *   - recent          : 최근 확인된 상품 상위 N (상품명·원본/쿠팡 상태·확인시각)
 *   - lastCheckAt     : 가장 최근 확인 시각 (신호등 신선도 판정용)
 *   - checkedLast5Min : 최근 5분 내 확인된 모니터 수 (감지가 "지금 돌고 있는지")
 *   - checkedLastHour : 최근 1시간 내 확인된 모니터 수 (처리량)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ error: '메가로드 계정이 필요합니다.' }, { status: 403 });
    }

    const FEED_LIMIT = 15;

    // 최근 확인된 모니터 상위 N (피드)
    const { data: rawFeed } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, product_id, source_status, coupang_status, last_checked_at')
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true)
      .not('last_checked_at', 'is', null)
      .order('last_checked_at', { ascending: false })
      .limit(FEED_LIMIT);

    const feedRows = (rawFeed || []) as {
      id: string;
      product_id: string;
      source_status: string;
      coupang_status: string;
      last_checked_at: string;
    }[];

    // 상품명 병합 (FK 미설정 → 별도 조회, 메인 route 와 동일 패턴)
    const productIds = [...new Set(feedRows.map((m) => m.product_id).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products } = await serviceClient
        .from('sh_products')
        .select('id, product_name, display_name')
        .in('id', productIds);
      for (const p of (products || []) as { id: string; product_name: string; display_name: string }[]) {
        nameMap.set(p.id, p.display_name || p.product_name || '상품명 없음');
      }
    }

    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60_000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60_000).toISOString();

    const [{ count: checkedLast5Min }, { count: checkedLastHour }] = await Promise.all([
      serviceClient
        .from('sh_stock_monitors')
        .select('*', { count: 'exact', head: true })
        .eq('megaload_user_id', shUserId)
        .eq('is_active', true)
        .gte('last_checked_at', fiveMinAgo),
      serviceClient
        .from('sh_stock_monitors')
        .select('*', { count: 'exact', head: true })
        .eq('megaload_user_id', shUserId)
        .eq('is_active', true)
        .gte('last_checked_at', oneHourAgo),
    ]);

    const recent = feedRows.map((m) => ({
      id: m.id,
      name: nameMap.get(m.product_id) || '상품명 없음',
      sourceStatus: m.source_status,
      coupangStatus: m.coupang_status,
      checkedAt: m.last_checked_at,
    }));

    return NextResponse.json(
      {
        recent,
        lastCheckAt: feedRows[0]?.last_checked_at || null,
        checkedLast5Min: checkedLast5Min || 0,
        checkedLastHour: checkedLastHour || 0,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
