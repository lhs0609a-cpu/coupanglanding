/** 7일 확정 크론 — confirm_at 경과 + 반품없음 pending 판매를 confirmed 로 전환. */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sc = await createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await sc
    .from('supplier_sales')
    .update({ status: 'confirmed' })
    .eq('status', 'pending')
    .lte('confirm_at', now)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, confirmed: (data || []).length });
}
