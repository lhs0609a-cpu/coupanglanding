import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/product-insights
 * 전 셀러(피티생) 실판매 데이터를 상품 단위로 집계 — "지금 어떤 상품이 잘 팔리는지".
 *
 * Query params:
 *   - days: 조회 기간(일). 기본 30
 *   - channel: 채널 필터(coupang/naver/...). 미지정 시 전체
 *   - groupBy: 'sku' (공급사 SKU = 실제 상품) | 'listing' (셀러 상품명). 기본 'sku'
 *
 * 반환:
 *   - kpi: 총 판매수량 / 총 매출(GMV) / 상품 종수 / 활성 셀러 수
 *   - top: 베스트셀러 랭킹(수량·매출·주문수·셀러수)
 *   - trend: 일자별 수량·매출 추이
 *   - byChannel: 채널별 매출·수량
 *   - rising: 직전 동일 기간 대비 매출 증가율 상위
 */

interface OrderRow {
  id: string;
  channel: string;
  ordered_at: string | null;
  megaload_user_id: string;
}
interface ItemRow {
  order_id: string;
  product_name: string | null;
  sku: string | null;
  quantity: number | null;
  unit_price: number | null;
  channel_product_id: string | null;
}

type Agg = {
  key: string;
  name: string;
  qty: number;
  revenue: number;
  orders: Set<string>;
  sellers: Set<string>;
  channels: Set<string>;
};

function emptyAgg(key: string, name: string): Agg {
  return { key, name, qty: 0, revenue: 0, orders: new Set(), sellers: new Set(), channels: new Set() };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
    const channelFilter = url.searchParams.get('channel') || '';
    const groupBy = url.searchParams.get('groupBy') === 'listing' ? 'listing' : 'sku';

    const service = await createServiceClient();

    const now = Date.now();
    const periodMs = days * 24 * 60 * 60 * 1000;
    const startIso = new Date(now - periodMs).toISOString();
    const prevStartIso = new Date(now - 2 * periodMs).toISOString();

    // 직전 기간까지 한 번에 조회 후 현재/직전으로 분리 (rising 계산용)
    let orderQuery = service
      .from('sh_orders')
      .select('id, channel, ordered_at, megaload_user_id')
      .gte('ordered_at', prevStartIso)
      .not('order_status', 'in', '("cancelled","returned")');
    if (channelFilter) orderQuery = orderQuery.eq('channel', channelFilter);

    const { data: orders, error: oErr } = await orderQuery;
    if (oErr) throw new Error(`orders: ${oErr.message}`);

    const orderRows = (orders || []) as OrderRow[];
    if (orderRows.length === 0) {
      return NextResponse.json({
        kpi: { qty: 0, revenue: 0, products: 0, sellers: 0 },
        top: [], trend: [], byChannel: [], rising: [], groupBy, days, channel: channelFilter,
      });
    }

    const orderById = new Map(orderRows.map((o) => [o.id, o]));

    // 주문상품 조회 (order_id in) — 청크 분할
    const ids = orderRows.map((o) => o.id);
    const items: ItemRow[] = [];
    const CHUNK = 300;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: chunk, error: iErr } = await service
        .from('sh_order_items')
        .select('order_id, product_name, sku, quantity, unit_price, channel_product_id')
        .in('order_id', slice);
      if (iErr) throw new Error(`items: ${iErr.message}`);
      items.push(...((chunk || []) as ItemRow[]));
    }

    // 집계
    const curr = new Map<string, Agg>();
    const prevRevenue = new Map<string, number>();
    const trendMap = new Map<string, { qty: number; revenue: number }>();
    const channelMap = new Map<string, { qty: number; revenue: number }>();

    for (const it of items) {
      const ord = orderById.get(it.order_id);
      if (!ord || !ord.ordered_at) continue;
      const qty = Number(it.quantity || 0);
      const revenue = qty * Number(it.unit_price || 0);
      const name = String(it.product_name || '(이름 없음)');

      // 그룹 키: sku 기준 — sku 비면 상품명으로 폴백. listing 기준 — 상품명(+channel_product_id).
      const key = groupBy === 'sku'
        ? (it.sku && it.sku.trim() ? `sku:${it.sku.trim()}` : `name:${name}`)
        : `lst:${ord.channel}:${it.channel_product_id || name}`;

      const inCurrent = ord.ordered_at >= startIso;

      if (inCurrent) {
        let a = curr.get(key);
        if (!a) { a = emptyAgg(key, name); curr.set(key, a); }
        a.qty += qty;
        a.revenue += revenue;
        a.orders.add(ord.id);
        a.sellers.add(ord.megaload_user_id);
        a.channels.add(ord.channel);

        const day = ord.ordered_at.slice(0, 10);
        const t = trendMap.get(day) || { qty: 0, revenue: 0 };
        t.qty += qty; t.revenue += revenue; trendMap.set(day, t);

        const c = channelMap.get(ord.channel) || { qty: 0, revenue: 0 };
        c.qty += qty; c.revenue += revenue; channelMap.set(ord.channel, c);
      } else {
        prevRevenue.set(key, (prevRevenue.get(key) || 0) + revenue);
      }
    }

    const aggs = Array.from(curr.values());

    // KPI
    const kpi = {
      qty: aggs.reduce((s, a) => s + a.qty, 0),
      revenue: aggs.reduce((s, a) => s + a.revenue, 0),
      products: aggs.length,
      sellers: new Set(aggs.flatMap((a) => Array.from(a.sellers))).size,
    };

    // Top 랭킹 (매출 기준 정렬, 수량도 제공)
    const top = aggs
      .map((a) => ({
        key: a.key,
        name: a.name,
        qty: a.qty,
        revenue: a.revenue,
        orders: a.orders.size,
        sellers: a.sellers.size,
        channels: Array.from(a.channels),
      }))
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 30);

    // Trend (날짜 오름차순)
    const trend = Array.from(trendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, qty: v.qty, revenue: v.revenue }));

    // 채널별
    const byChannel = Array.from(channelMap.entries())
      .map(([channel, v]) => ({ channel, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    // 급상승: 현재 매출 대비 직전 기간 매출 증가율 (직전 0이면 신규로 취급)
    const rising = aggs
      .map((a) => {
        const prev = prevRevenue.get(a.key) || 0;
        const growth = prev > 0 ? (a.revenue - prev) / prev : (a.revenue > 0 ? Infinity : 0);
        return { key: a.key, name: a.name, revenue: a.revenue, prevRevenue: prev, qty: a.qty, growth, isNew: prev === 0 };
      })
      .filter((r) => r.revenue > 0 && (r.growth > 0))
      .sort((a, b) => {
        // 신규(Infinity)는 매출 큰 순, 그 외는 증가율 순
        if (a.growth === Infinity && b.growth === Infinity) return b.revenue - a.revenue;
        if (a.growth === Infinity) return -1;
        if (b.growth === Infinity) return 1;
        return b.growth - a.growth;
      })
      .slice(0, 15)
      .map((r) => ({ ...r, growth: r.growth === Infinity ? null : Math.round(r.growth * 100) }));

    return NextResponse.json({ kpi, top, trend, byChannel, rising, groupBy, days, channel: channelFilter });
  } catch (err) {
    void logSystemError({ source: 'admin/product-insights', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '집계 실패' }, { status: 500 });
  }
}
