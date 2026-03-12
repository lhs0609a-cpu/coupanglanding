import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { COURIER_CHANNEL_CODES } from '@/lib/sellerhub/constants';
import type { Channel } from '@/lib/sellerhub/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { invoices } = await request.json() as {
      invoices: { orderId: string; courierCode: string; invoiceNumber: string }[];
    };
    if (!invoices?.length) return NextResponse.json({ error: '송장 정보가 필요합니다' }, { status: 400 });

    const serviceClient = await createServiceClient();
    const orderIds = invoices.map((i) => i.orderId);
    const { data: orders } = await serviceClient
      .from('sh_orders')
      .select('id, sellerhub_user_id, channel, channel_order_id')
      .in('id', orderIds);

    if (!orders?.length) return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });

    const orderMap = new Map(orders.map((o) => [(o as Record<string, unknown>).id as string, o]));
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // 채널별 어댑터 캐시
    const adapterCache = new Map<string, Awaited<ReturnType<typeof getAuthenticatedAdapter>>>();

    for (const inv of invoices) {
      const order = orderMap.get(inv.orderId) as Record<string, unknown> | undefined;
      if (!order) { failed++; continue; }

      const channel = order.channel as Channel;
      const shUserId = order.sellerhub_user_id as string;
      const cacheKey = `${shUserId}:${channel}`;

      try {
        let adapter = adapterCache.get(cacheKey);
        if (!adapter) {
          adapter = await getAuthenticatedAdapter(serviceClient, shUserId, channel);
          adapterCache.set(cacheKey, adapter);
        }

        const courierMapping = COURIER_CHANNEL_CODES[inv.courierCode];
        const channelCourierCode = courierMapping?.[channel] || inv.courierCode;

        await adapter.registerInvoice(order.channel_order_id as string, channelCourierCode, inv.invoiceNumber);

        await serviceClient
          .from('sh_orders')
          .update({
            order_status: 'shipping',
            courier_code: inv.courierCode,
            invoice_number: inv.invoiceNumber,
            shipped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', inv.orderId);

        success++;
      } catch (err) {
        failed++;
        errors.push(`${inv.orderId}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    return NextResponse.json({ success, failed, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '일괄 송장등록 실패' }, { status: 500 });
  }
}
