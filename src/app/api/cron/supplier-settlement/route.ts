/**
 * 공급사 정산 크론 — 매월 대상 공급사의 확정 GMV 수수료를 카드 자동결제.
 *   기본 대상월 = 전월(M-1). ?month=YYYY-MM 로 override 가능.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { settleSupplierMonth } from '@/lib/megaload/supplier/settlement';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sc = await createServiceClient();

  const override = request.nextUrl.searchParams.get('month');
  let yearMonth = override || '';
  if (!yearMonth) {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    yearMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }

  const { data: suppliers } = await sc
    .from('suppliers')
    .select('id, commission_rate, commission_base, billing_key, billing_status, owner_profile_id')
    .eq('status', 'approved');

  const results: Record<string, number> = { paid: 0, skipped: 0, no_card: 0, failed: 0 };
  for (const s of (suppliers || []) as Parameters<typeof settleSupplierMonth>[1][]) {
    try {
      const r = await settleSupplierMonth(sc, s, yearMonth);
      results[r.status] = (results[r.status] || 0) + 1;
    } catch { results.failed++; }
  }

  return NextResponse.json({ success: true, yearMonth, suppliers: (suppliers || []).length, results });
}
