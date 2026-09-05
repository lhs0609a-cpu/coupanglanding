/**
 * GET /api/supplier/dashboard
 *   공급사 대시보드 — 이번 달 발생/확정 GMV, 예상 청구액, 셀러별 실적(익명), 정산 이력.
 *   청구는 오직 '확정(confirmed)' 기준 → 실시간 잠정치는 참고용으로 분리 표기.
 */
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sc = await createServiceClient();
  const supplier = await getSupplierByProfile(sc, user.id);
  if (!supplier) return NextResponse.json({ error: '공급사 등록이 필요합니다.' }, { status: 403 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const base = supplier.commission_base === 'supply' ? 'supply_amount' : 'retail_amount';

  // 이번 달 판매 (취소 제외)
  const { data: salesRaw } = await sc
    .from('supplier_sales')
    .select('seller_megaload_user_id, catalog_product_id, quantity, supply_amount, retail_amount, status, sold_at')
    .eq('supplier_id', supplier.id)
    .gte('sold_at', monthStart)
    .neq('status', 'cancelled')
    .limit(5000);

  type Sale = { seller_megaload_user_id: string; catalog_product_id: string; quantity: number; supply_amount: number; retail_amount: number; status: string; sold_at: string };
  const sales = (salesRaw || []) as unknown as Sale[];
  const amt = (s: Sale) => (base === 'supply_amount' ? s.supply_amount : s.retail_amount);

  const gmvAll = sales.reduce((t, s) => t + amt(s), 0);                    // 잠정(전체)
  const gmvConfirmed = sales.filter((s) => s.status === 'confirmed').reduce((t, s) => t + amt(s), 0);
  const qtyAll = sales.reduce((t, s) => t + (s.quantity || 0), 0);
  const rate = supplier.commission_rate || 0;
  const estimatedCharge = Math.round(gmvConfirmed * rate / 100);          // 청구는 확정분만

  // 셀러별 실적 (익명)
  const bySeller = new Map<string, { qty: number; gmv: number; orders: number }>();
  for (const s of sales) {
    const cur = bySeller.get(s.seller_megaload_user_id) || { qty: 0, gmv: 0, orders: 0 };
    cur.qty += s.quantity || 0; cur.gmv += amt(s); cur.orders += 1;
    bySeller.set(s.seller_megaload_user_id, cur);
  }
  const sellers = Array.from(bySeller.entries())
    .map(([id, v]) => ({ alias: `셀러 #${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`, ...v }))
    .sort((a, b) => b.gmv - a.gmv);

  // 정산 이력
  const { data: settlements } = await sc
    .from('supplier_settlements')
    .select('year_month, gmv_confirmed, commission_amount, clawback_amount, net_amount, payment_status, paid_at')
    .eq('supplier_id', supplier.id)
    .order('year_month', { ascending: false })
    .limit(12);

  // ── 상품별 성과 + 공지 ──
  const { data: prodRaw } = await sc
    .from('supplier_products')
    .select('id, seller_product_name, status, supplier_notice, supplier_notice_at, options:supplier_product_options(stock)')
    .eq('supplier_id', supplier.id)
    .order('created_at', { ascending: false })
    .limit(200);
  type Prod = { id: string; seller_product_name: string; status: string; supplier_notice: string | null; supplier_notice_at: string | null; options: { stock: number }[] | null };
  const prods = (prodRaw || []) as unknown as Prod[];
  const nameById = new Map(prods.map((p) => [p.id, p.seller_product_name]));
  const prodIds = prods.map((p) => p.id);
  const NIL = '00000000-0000-0000-0000-000000000000';

  // 상품별 이번 달 판매수량
  const monthQtyByProduct = new Map<string, number>();
  for (const s of sales) monthQtyByProduct.set(s.catalog_product_id, (monthQtyByProduct.get(s.catalog_product_id) || 0) + (s.quantity || 0));

  // 상품별 판매중 셀러 수 (활성/등록중 리스팅)
  const sellerSetByProduct = new Map<string, Set<string>>();
  if (prodIds.length) {
    const { data: lst } = await sc
      .from('supplier_listings')
      .select('catalog_product_id, seller_megaload_user_id, status')
      .in('catalog_product_id', prodIds)
      .in('status', ['active', 'registering']);
    for (const l of (lst || []) as { catalog_product_id: string; seller_megaload_user_id: string }[]) {
      const set = sellerSetByProduct.get(l.catalog_product_id) || new Set<string>();
      set.add(l.seller_megaload_user_id);
      sellerSetByProduct.set(l.catalog_product_id, set);
    }
  }

  const products = prods.map((p) => ({
    id: p.id,
    name: p.seller_product_name,
    status: p.status,
    notice: p.supplier_notice,
    notice_at: p.supplier_notice_at,
    stock: (p.options || []).reduce((t, o) => t + (o.stock || 0), 0),
    sellerCount: sellerSetByProduct.get(p.id)?.size || 0,
    monthQty: monthQtyByProduct.get(p.id) || 0,
  })).sort((a, b) => b.monthQty - a.monthQty || b.sellerCount - a.sellerCount);

  // ── 실시간 활동 피드 (등록 + 판매) ──
  const alias = (uid: string) => `셀러 #${uid.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const [{ data: recentListings }, { data: recentSales }] = await Promise.all([
    sc.from('supplier_listings')
      .select('catalog_product_id, seller_megaload_user_id, created_at')
      .in('catalog_product_id', prodIds.length ? prodIds : [NIL])
      .order('created_at', { ascending: false }).limit(15),
    sc.from('supplier_sales')
      .select('catalog_product_id, seller_megaload_user_id, quantity, retail_amount, sold_at')
      .eq('supplier_id', supplier.id)
      .order('sold_at', { ascending: false }).limit(15),
  ]);
  type ActItem = { type: 'listed' | 'sold'; at: string; product: string; seller: string; qty?: number; amount?: number };
  const activity: ActItem[] = [
    ...((recentListings || []) as { catalog_product_id: string; seller_megaload_user_id: string; created_at: string }[])
      .map((l) => ({ type: 'listed' as const, at: l.created_at, product: nameById.get(l.catalog_product_id) || '상품', seller: alias(l.seller_megaload_user_id) })),
    ...((recentSales || []) as { catalog_product_id: string; seller_megaload_user_id: string; quantity: number; retail_amount: number; sold_at: string }[])
      .map((s) => ({ type: 'sold' as const, at: s.sold_at, product: nameById.get(s.catalog_product_id) || '상품', seller: alias(s.seller_megaload_user_id), qty: s.quantity, amount: s.retail_amount })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);

  return NextResponse.json({
    supplier: { commission_rate: rate, commission_base: supplier.commission_base, billing_status: supplier.billing_status },
    thisMonth: {
      gmvAll, gmvConfirmed, qtyAll, estimatedCharge,
      pendingGmv: gmvAll - gmvConfirmed,
      projectedCharge: Math.round(gmvAll * rate / 100),   // 잠정 포함 예상 정산(대기분까지)
    },
    sellers,
    settlements: settlements || [],
    products,
    activity,
  });
}
