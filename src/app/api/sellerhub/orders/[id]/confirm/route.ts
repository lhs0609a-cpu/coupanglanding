import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import type { Channel } from '@/lib/sellerhub/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const serviceClient = await createServiceClient();

    const { data: order } = await serviceClient
      .from('sh_orders')
      .select('*, sellerhub_user_id, channel, channel_order_id')
      .eq('id', id)
      .single();

    if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });

    const orderData = order as Record<string, unknown>;
    const channel = orderData.channel as Channel;
    const shUserId = orderData.sellerhub_user_id as string;

    // 채널 어댑터를 통해 실제 발주확인
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, channel);
    const result = await adapter.confirmOrder(orderData.channel_order_id as string);

    if (!result.success) {
      return NextResponse.json({ error: '채널 발주확인 실패' }, { status: 502 });
    }

    // DB 상태 업데이트
    await serviceClient
      .from('sh_orders')
      .update({ order_status: 'order_confirmed', updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '발주확인 실패' }, { status: 500 });
  }
}
