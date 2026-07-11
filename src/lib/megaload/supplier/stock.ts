/**
 * 공유 재고풀 차감 + 품절 전파.
 *   공급사 재고를 전 셀러가 나눠 팔고, 팔릴 때마다 차감.
 *   상품 총재고 <= buffer 이면 그 상품의 모든 리스팅을 판매중지(DB + 채널).
 *
 * ⚠️ 폴링 기반이라 완벽 실시간 아님 → buffer 로 오버셀 조기차단(설계상 안전장치).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdapter } from '../adapters/factory';
import type { CoupangAdapter } from '../adapters/coupang.adapter';

export async function decrementStock(
  sc: SupabaseClient,
  catalogProductId: string,
  optionId: string | null,
  qty: number,
): Promise<{ soldOut: boolean; totalStock: number }> {
  if (optionId) {
    const { data: opt } = await sc
      .from('supplier_product_options').select('stock').eq('id', optionId).maybeSingle();
    if (opt) {
      const newStock = Math.max(0, ((opt as { stock: number }).stock || 0) - qty);
      await sc.from('supplier_product_options').update({ stock: newStock }).eq('id', optionId);
    }
  }

  const { data: opts } = await sc
    .from('supplier_product_options').select('stock, stock_buffer').eq('catalog_product_id', catalogProductId);
  const rows = (opts || []) as { stock: number; stock_buffer: number }[];
  const totalStock = rows.reduce((s, o) => s + (o.stock || 0), 0);
  const maxBuffer = rows.reduce((m, o) => Math.max(m, o.stock_buffer || 0), 0);

  if (totalStock <= maxBuffer) {
    // DB: 전 리스팅 판매중지
    await sc.from('supplier_listings')
      .update({ status: 'suspended' })
      .eq('catalog_product_id', catalogProductId).eq('status', 'active');
    return { soldOut: true, totalStock };
  }
  return { soldOut: false, totalStock };
}

/** 품절 상품의 각 셀러 리스팅을 채널에서도 실제 판매중지(vendorItemId 기준, best-effort). */
export async function stopSoldOutOnChannels(sc: SupabaseClient, catalogProductId: string): Promise<number> {
  const { data: listings } = await sc
    .from('supplier_listings')
    .select('seller_megaload_user_id, vendor_item_id, channel')
    .eq('catalog_product_id', catalogProductId)
    .eq('channel', 'coupang')
    .not('vendor_item_id', 'is', null);

  let stopped = 0;
  for (const l of (listings || []) as { seller_megaload_user_id: string; vendor_item_id: string }[]) {
    try {
      const adapter = await getAuthenticatedAdapter(sc, l.seller_megaload_user_id, 'coupang') as CoupangAdapter;
      await adapter.stopItemSale(l.vendor_item_id);
      stopped++;
    } catch { /* best-effort */ }
  }
  return stopped;
}
