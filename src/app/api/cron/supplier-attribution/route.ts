/** 판매 귀속 크론 — 연결된 셀러들의 최근 쿠팡 주문을 supplier_sales 로 귀속. */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { attributeSellerOrders } from '@/lib/megaload/supplier/attribution';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sc = await createServiceClient();

  // 리스팅 있는 셀러 목록 (쿠팡)
  const { data: rows } = await sc
    .from('supplier_listings')
    .select('seller_megaload_user_id')
    .eq('channel', 'coupang')
    .in('status', ['active', 'registering']);
  const sellerIds = Array.from(new Set((rows || []).map((r) => (r as { seller_megaload_user_id: string }).seller_megaload_user_id)));

  // 최근 3일 (KST)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const toDate = kstNow.toISOString().slice(0, 10);
  const fromDate = new Date(kstNow.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let totalMatched = 0, totalInserted = 0, failedSellers = 0;
  for (const sellerId of sellerIds) {
    try {
      const adapter = await getAuthenticatedAdapter(sc, sellerId, 'coupang') as CoupangAdapter;
      const r = await attributeSellerOrders(sc, sellerId, adapter, fromDate, toDate);
      totalMatched += r.matched; totalInserted += r.inserted;
    } catch { failedSellers++; }
  }

  return NextResponse.json({ success: true, sellers: sellerIds.length, totalMatched, totalInserted, failedSellers, fromDate, toDate });
}
