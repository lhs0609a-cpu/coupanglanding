import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { COURIER_CHANNEL_CODES } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { courierCode, invoiceNumber } = await request.json();

    if (!courierCode || !invoiceNumber) {
      return NextResponse.json({ error: '택배사와 송장번호가 필요합니다' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data: order } = await serviceClient
      .from('sh_orders')
      .select('*, megaload_user_id, channel, channel_order_id')
      .eq('id', id)
      .single();

    if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });

    const orderData = order as Record<string, unknown>;
    const channel = orderData.channel as Channel;
    const shUserId = orderData.megaload_user_id as string;

    // 채널별 택배사 코드 변환
    const courierMapping = COURIER_CHANNEL_CODES[courierCode];
    const channelCourierCode = courierMapping?.[channel] || courierCode;

    // 채널 어댑터를 통해 실제 송장등록
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, channel);
    const result = await adapter.registerInvoice(
      orderData.channel_order_id as string,
      channelCourierCode,
      invoiceNumber
    );

    if (!result.success) {
      return NextResponse.json({ error: '채널 송장등록 실패' }, { status: 502 });
    }

    // DB 업데이트
    await serviceClient
      .from('sh_orders')
      .update({
        order_status: 'shipping',
        courier_code: courierCode,
        invoice_number: invoiceNumber,
        shipped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '송장등록 실패' }, { status: 500 });
  }
}
