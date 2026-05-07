import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import type { PendingPriceChange } from '@/lib/supabase/types';

export const maxDuration = 30;


/**
 * POST /api/megaload/stock-monitor/price-approve
 * body: { monitorId: string }
 * 승인 대기 중인 가격 변경을 승인해 쿠팡에 반영
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
    const { monitorId } = body as { monitorId: string };
    if (!monitorId) {
      return NextResponse.json({ error: 'monitorId가 필요합니다.' }, { status: 400 });
    }

    const { data: monitor, error: fetchErr } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, product_id, coupang_product_id, pending_price_change, source_price_last')
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!monitor) return NextResponse.json({ error: '해당 모니터를 찾을 수 없습니다.' }, { status: 404 });

    const pending = (monitor as { pending_price_change: PendingPriceChange | null }).pending_price_change;
    if (!pending) {
      return NextResponse.json({ error: '승인 대기 중인 가격 변경이 없습니다.' }, { status: 400 });
    }

    const coupangProductId = (monitor as { coupang_product_id: string }).coupang_product_id;
    const productId = (monitor as { product_id: string }).product_id;

    // 쿠팡 어댑터 획득
    let adapter: CoupangAdapter;
    try {
      adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;
    } catch {
      return NextResponse.json({ error: '쿠팡 API 키가 설정되지 않았습니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    try {
      await adapter.updatePrice(coupangProductId, pending.newPrice);

      // pending 클리어 + 가격 갱신
      await serviceClient.from('sh_stock_monitors').update({
        pending_price_change: null,
        our_price_last: pending.newPrice,
        price_last_applied_at: now,
        updated_at: now,
      }).eq('id', monitorId);

      await serviceClient.from('sh_product_options')
        .update({ sale_price: pending.newPrice })
        .eq('product_id', productId);

      await serviceClient.from('sh_stock_monitor_logs').insert({
        monitor_id: monitorId,
        megaload_user_id: shUserId,
        event_type: 'price_approved',
        source_price_after: pending.sourcePrice,
        our_price_before: pending.oldPrice,
        our_price_after: pending.newPrice,
        action_taken: 'coupang_price_updated',
        action_success: true,
      });

      await serviceClient.from('sh_stock_monitor_logs').insert({
        monitor_id: monitorId,
        megaload_user_id: shUserId,
        event_type: 'price_updated_coupang',
        source_price_after: pending.sourcePrice,
        our_price_before: pending.oldPrice,
        our_price_after: pending.newPrice,
        action_taken: 'coupang_price_updated',
        action_success: true,
      });

      return NextResponse.json({ success: true, applied: pending });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'updatePrice failed';

      await serviceClient.from('sh_stock_monitor_logs').insert({
        monitor_id: monitorId,
        megaload_user_id: shUserId,
        event_type: 'price_update_failed',
        source_price_after: pending.sourcePrice,
        our_price_before: pending.oldPrice,
        our_price_after: pending.newPrice,
        action_taken: 'coupang_price_updated',
        action_success: false,
        error_message: msg.slice(0, 500),
      });

      return NextResponse.json({ error: `쿠팡 가격 업데이트 실패: ${msg}` }, { status: 500 });
    }
  } catch (err) {
    console.error('price-approve POST error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
