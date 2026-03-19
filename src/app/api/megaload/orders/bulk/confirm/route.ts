import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { Channel } from '@/lib/megaload/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { orderIds } = await request.json() as { orderIds: string[] };
    if (!orderIds?.length) return NextResponse.json({ error: '주문 ID가 필요합니다' }, { status: 400 });

    const serviceClient = await createServiceClient();
    const { data: orders } = await serviceClient
      .from('sh_orders')
      .select('id, megaload_user_id, channel, channel_order_id')
      .in('id', orderIds);

    if (!orders?.length) return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // 채널별로 그룹핑하여 처리
    const grouped = new Map<string, typeof orders>();
    for (const order of orders) {
      const key = `${(order as Record<string, unknown>).megaload_user_id}:${(order as Record<string, unknown>).channel}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(order);
    }

    for (const [, channelOrders] of grouped) {
      const first = channelOrders[0] as Record<string, unknown>;
      try {
        const adapter = await getAuthenticatedAdapter(serviceClient, first.megaload_user_id as string, first.channel as Channel);

        for (const order of channelOrders) {
          const o = order as Record<string, unknown>;
          try {
            await adapter.confirmOrder(o.channel_order_id as string);
            await serviceClient
              .from('sh_orders')
              .update({ order_status: 'order_confirmed', updated_at: new Date().toISOString() })
              .eq('id', o.id);
            success++;
          } catch (err) {
            failed++;
            errors.push(`${o.id}: ${err instanceof Error ? err.message : 'failed'}`);
          }
        }
      } catch (err) {
        failed += channelOrders.length;
        errors.push(`채널 인증 실패: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    return NextResponse.json({ success, failed, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '일괄 발주확인 실패' }, { status: 500 });
  }
}
