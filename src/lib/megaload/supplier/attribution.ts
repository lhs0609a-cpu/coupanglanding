/**
 * 판매 귀속 — 셀러 쿠팡 주문(ordersheets)에서 우리 리스팅 상품을 식별해 supplier_sales 기록.
 *
 * 매칭 키(결정론적, 우리가 등록 시 심음):
 *   1순위 vendorItemId  == supplier_listings.vendor_item_id (불변)
 *   2순위 sellerProductId == supplier_listings.channel_product_id
 * 멱등: supplier_sales UNIQUE(channel, order_id, vendor_item_id) → 중복 카운트 차단.
 *
 * ⚠️ ordersheets 응답 필드명은 실계정 검증 필요(쿠팡 스키마 기반 best-effort).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoupangAdapter } from '../adapters/coupang.adapter';
import { decrementStock } from './stock';
import { notifySupplierProductSold, notifySupplierStockDepleted, notifySupplierStockLow } from '@/lib/utils/notifications';

const CONFIRM_DAYS = 7;   // 배송완료(≈주문+배송) 후 반품불가 기준 7일

interface ListingRef {
  id: string; catalog_product_id: string; supplier_id: string;
  retail_price: number; vendor_item_id: string | null; channel_product_id: string | null;
  min_supply_price: number; option_id: string | null;
  supplier_profile_id: string | null; product_name: string;
}

/** 한 셀러의 최근 주문을 귀속 처리. */
export async function attributeSellerOrders(
  sc: SupabaseClient,
  sellerId: string,
  adapter: CoupangAdapter,
  fromDate: string,   // yyyy-MM-dd
  toDate: string,
): Promise<{ matched: number; inserted: number }> {
  // 이 셀러의 리스팅 + 상품/공급사/최저공급가 로드 → 매칭 인덱스
  const { data: listings } = await sc
    .from('supplier_listings')
    .select('id, catalog_product_id, retail_price, vendor_item_id, channel_product_id, ' +
            'product:supplier_products(supplier_id, seller_product_name, ' +
            'supplier:suppliers(owner_profile_id), options:supplier_product_options(id, supply_price))')
    .eq('seller_megaload_user_id', sellerId)
    .eq('channel', 'coupang');

  const byVendorItem = new Map<string, ListingRef>();
  const bySellerProduct = new Map<string, ListingRef>();
  for (const raw of (listings || []) as unknown as Record<string, unknown>[]) {
    const product = raw.product as {
      supplier_id?: string; seller_product_name?: string;
      supplier?: { owner_profile_id?: string } | null;
      options?: { id: string; supply_price: number }[];
    } | null;
    const opts = product?.options || [];
    const ref: ListingRef = {
      id: String(raw.id), catalog_product_id: String(raw.catalog_product_id),
      supplier_id: String(product?.supplier_id || ''),
      retail_price: Number(raw.retail_price) || 0,
      vendor_item_id: raw.vendor_item_id ? String(raw.vendor_item_id) : null,
      channel_product_id: raw.channel_product_id ? String(raw.channel_product_id) : null,
      min_supply_price: opts.length ? Math.min(...opts.map((o) => o.supply_price)) : 0,
      option_id: opts.length ? opts[0].id : null,
      supplier_profile_id: product?.supplier?.owner_profile_id || null,
      product_name: product?.seller_product_name || '상품',
    };
    if (ref.vendor_item_id) byVendorItem.set(ref.vendor_item_id, ref);
    if (ref.channel_product_id) bySellerProduct.set(ref.channel_product_id, ref);
  }
  if (byVendorItem.size === 0 && bySellerProduct.size === 0) return { matched: 0, inserted: 0 };

  const { items: orders } = await adapter.getOrders({ startDate: fromDate, endDate: toDate });

  let matched = 0, inserted = 0;
  for (const order of orders) {
    const orderId = String((order as Record<string, unknown>).orderId || '');
    const orderedAt = String((order as Record<string, unknown>).orderedAt || '') || new Date().toISOString();
    const orderItems = Array.isArray((order as Record<string, unknown>).orderItems)
      ? (order as Record<string, unknown>).orderItems as Record<string, unknown>[] : [];

    for (const it of orderItems) {
      const vendorItemId = it.vendorItemId != null ? String(it.vendorItemId) : '';
      const sellerProductId = it.sellerProductId != null ? String(it.sellerProductId) : '';
      const ref = (vendorItemId && byVendorItem.get(vendorItemId)) || (sellerProductId && bySellerProduct.get(sellerProductId));
      if (!ref) continue;
      matched++;

      const qty = Number(it.shippingCount ?? it.quantity ?? 1) || 1;
      const soldAt = new Date(orderedAt);
      const confirmAt = new Date(soldAt.getTime() + CONFIRM_DAYS * 24 * 60 * 60 * 1000);

      const { error, data } = await sc.from('supplier_sales').upsert({
        supplier_id: ref.supplier_id,
        catalog_product_id: ref.catalog_product_id,
        catalog_option_id: ref.option_id,
        listing_id: ref.id,
        seller_megaload_user_id: sellerId,
        channel: 'coupang',
        order_id: orderId,
        vendor_item_id: vendorItemId || sellerProductId,
        quantity: qty,
        supply_amount: ref.min_supply_price * qty,
        retail_amount: ref.retail_price * qty,
        sold_at: soldAt.toISOString(),
        confirm_at: confirmAt.toISOString(),
        status: 'pending',
      }, { onConflict: 'channel,order_id,vendor_item_id', ignoreDuplicates: true }).select('id');

      if (!error && data && data.length > 0) {
        inserted++;
        // 신규 판매 → 재고 차감 + 품절 전파
        const dec = await decrementStock(sc, ref.catalog_product_id, ref.option_id, qty).catch(() => null);
        // 공급사 알림: 판매 발생 + (재고 소진 시) 자동 판매중지 (실패해도 귀속엔 영향 없음)
        if (ref.supplier_profile_id) {
          await notifySupplierProductSold(
            sc, ref.supplier_profile_id, ref.product_name, qty, ref.retail_price * qty,
          ).catch(() => {});
          if (dec?.soldOut) {
            await notifySupplierStockDepleted(sc, ref.supplier_profile_id, ref.product_name).catch(() => {});
          } else if (dec?.lowStock) {
            await notifySupplierStockLow(sc, ref.supplier_profile_id, ref.product_name, dec.totalStock).catch(() => {});
          }
        }
      }
    }
  }
  return { matched, inserted };
}
