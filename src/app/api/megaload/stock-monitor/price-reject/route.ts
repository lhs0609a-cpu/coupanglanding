import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { PendingPriceChange } from '@/lib/supabase/types';

/**
 * POST /api/megaload/stock-monitor/price-reject
 * body: { monitorId: string, reason?: string }
 * 승인 대기 중인 가격 변경을 거부 (쿠팡 호출 없음)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const body = await request.json();
    const { monitorId, reason } = body as { monitorId: string; reason?: string };
    if (!monitorId) {
      return NextResponse.json({ error: 'monitorId가 필요합니다.' }, { status: 400 });
    }

    const { data: monitor, error: fetchErr } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, pending_price_change')
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!monitor) return NextResponse.json({ error: '해당 모니터를 찾을 수 없습니다.' }, { status: 404 });

    const pending = (monitor as { pending_price_change: PendingPriceChange | null }).pending_price_change;
    if (!pending) {
      return NextResponse.json({ error: '승인 대기 중인 가격 변경이 없습니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await serviceClient.from('sh_stock_monitors').update({
      pending_price_change: null,
      updated_at: now,
    }).eq('id', monitorId);

    await serviceClient.from('sh_stock_monitor_logs').insert({
      monitor_id: monitorId,
      megaload_user_id: shUserId,
      event_type: 'price_rejected',
      source_price_after: pending.sourcePrice,
      our_price_before: pending.oldPrice,
      our_price_after: pending.newPrice,
      price_skip_reason: reason || 'user rejected',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('price-reject POST error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
