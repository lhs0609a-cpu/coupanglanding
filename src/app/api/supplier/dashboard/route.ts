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

  return NextResponse.json({
    supplier: { commission_rate: rate, commission_base: supplier.commission_base, billing_status: supplier.billing_status },
    thisMonth: {
      gmvAll, gmvConfirmed, qtyAll, estimatedCharge,
      pendingGmv: gmvAll - gmvConfirmed,
    },
    sellers,
    settlements: settlements || [],
  });
}
