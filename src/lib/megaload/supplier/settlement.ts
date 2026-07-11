/**
 * 공급사 월 정산 — 확정(confirmed) 판매만 집계 → 수수료 산정 → 카드 자동결제.
 *   commission_base: 'retail'(판매액) | 'supply'(공급가) 기준 GMV × commission_rate%.
 *   반품(returned)은 이미 청구된 분에서 clawback 으로 차감.
 *   청구는 오직 확정분 → "안 팔렸는데 청구" 구조적 차단.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { TossPaymentsAPI, generateCustomerKey, generateOrderId } from '@/lib/payments/toss-client';
import { decryptPassword } from '@/lib/utils/encryption';

interface SupplierRow {
  id: string; commission_rate: number; commission_base: 'retail' | 'supply';
  billing_key: string | null; billing_status: string;
}

/** 한 공급사의 특정 월 정산 원장 생성 + 결제 시도. */
export async function settleSupplierMonth(
  sc: SupabaseClient,
  supplier: SupplierRow,
  yearMonth: string,   // 'YYYY-MM'
): Promise<{ status: string; net: number; message?: string }> {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();

  // 확정 판매 집계
  const { data: sales } = await sc
    .from('supplier_sales')
    .select('supply_amount, retail_amount, status')
    .eq('supplier_id', supplier.id)
    .gte('confirm_at', start).lt('confirm_at', end)
    .in('status', ['confirmed', 'returned']);

  const rows = (sales || []) as { supply_amount: number; retail_amount: number; status: string }[];
  const amount = (r: { supply_amount: number; retail_amount: number }) =>
    supplier.commission_base === 'supply' ? r.supply_amount : r.retail_amount;

  const confirmedGmv = rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + amount(r), 0);
  const returnedGmv = rows.filter((r) => r.status === 'returned').reduce((s, r) => s + amount(r), 0);
  const rate = supplier.commission_rate || 0;
  const commission = Math.round(confirmedGmv * rate / 100);
  const clawback = Math.round(returnedGmv * rate / 100);
  const net = Math.max(0, commission - clawback);

  // 원장 upsert
  const { data: settlement } = await sc.from('supplier_settlements').upsert({
    supplier_id: supplier.id, year_month: yearMonth,
    gmv_confirmed: confirmedGmv, commission_rate: rate,
    commission_amount: commission, clawback_amount: clawback, net_amount: net,
    payment_status: net <= 0 ? 'skipped' : 'awaiting_payment',
  }, { onConflict: 'supplier_id,year_month' }).select('id, payment_status').single();

  if (net <= 0) return { status: 'skipped', net: 0 };
  if (!supplier.billing_key || supplier.billing_status !== 'active') {
    return { status: 'no_card', net, message: '카드 미등록 — 청구 보류' };
  }

  // 카드 결제
  try {
    const billingKey = await decryptPassword(supplier.billing_key);
    const customerKey = generateCustomerKey(supplier.id);
    const orderId = generateOrderId(yearMonth, supplier.id);
    const result = await TossPaymentsAPI.payWithBillingKey(
      billingKey, customerKey, net, orderId, `메가로드 공급사 수수료 ${yearMonth}`,
    );
    await sc.from('supplier_settlements')
      .update({ payment_status: 'paid', toss_payment_key: result.paymentKey, paid_at: result.approvedAt || new Date().toISOString() })
      .eq('id', settlement!.id);
    return { status: 'paid', net };
  } catch (e) {
    await sc.from('supplier_settlements').update({ payment_status: 'failed' }).eq('id', settlement!.id);
    return { status: 'failed', net, message: e instanceof Error ? e.message : '결제 실패' };
  }
}
