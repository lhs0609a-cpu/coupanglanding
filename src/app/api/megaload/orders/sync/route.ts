import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAllAuthenticatedAdapters } from '@/lib/megaload/adapters/factory';
import { CHANNEL_ORDER_STATUS_MAP } from '@/lib/megaload/constants';
import type { Channel, OrderStatus } from '@/lib/megaload/types';

function normalizeOrderStatus(channel: Channel, rawStatus: string): OrderStatus {
  return CHANNEL_ORDER_STATUS_MAP[channel]?.[rawStatus] || 'payment_done';
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });

    const serviceClient = await createServiceClient();
    const shUserId = (shUser as Record<string, unknown>).id as string;
    const adapters = await getAllAuthenticatedAdapters(serviceClient, shUserId);

    if (adapters.length === 0) {
      return NextResponse.json({ error: '연결된 채널이 없습니다' }, { status: 400 });
    }

    // 최근 7일 주문 수집
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let totalCollected = 0;
    const channelResults: Record<string, number> = {};
    const channelErrors: Record<string, string> = {};

    for (const { channel, adapter } of adapters) {
      try {
        const result = await adapter.getOrders({ startDate, endDate });
        channelResults[channel] = result.items.length;

        for (const item of result.items) {
          const channelOrderId = String(item.orderId || item.orderNo || item.productOrderId || '');
          if (!channelOrderId) continue;

          const rawStatus = String(item.status || item.orderStatus || '');
          const orderStatus = normalizeOrderStatus(channel, rawStatus);

          const receiverName = String(item.receiverName || (item.receiver as Record<string, unknown>)?.name || '');
          const receiverPhone = String(item.receiverPhone || (item.receiver as Record<string, unknown>)?.tel1 || '');
          const receiverAddress = String(item.receiverAddress || (item.receiver as Record<string, unknown>)?.addr1 || '');
          const orderedAt = String(item.orderedAt || item.orderDate || item.paymentDate || new Date().toISOString());
          const totalPrice = Number(item.totalPrice || item.paymentAmount || item.settlePrice || 0);
          const buyerName = String(item.buyerName || (item.orderer as Record<string, unknown>)?.name || '');

          // Upsert order
          const { data: upsertedOrder } = await serviceClient
            .from('sh_orders')
            .upsert({
              megaload_user_id: shUserId,
              channel,
              channel_order_id: channelOrderId,
              order_status: orderStatus,
              buyer_name: buyerName,
              receiver_name: receiverName,
              receiver_phone: receiverPhone,
              receiver_address: receiverAddress,
              total_price: totalPrice,
              ordered_at: orderedAt,
              raw_data: item,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'megaload_user_id,channel,channel_order_id' })
            .select('id')
            .single();

          const orderId = (upsertedOrder as Record<string, unknown>)?.id as string;

          // Upsert order items
          if (orderId) {
            const items = (item.orderItems || item.productOrderItems || []) as Record<string, unknown>[];
            for (const orderItem of items) {
              await serviceClient
                .from('sh_order_items')
                .upsert({
                  order_id: orderId,
                  megaload_user_id: shUserId,
                  product_name: String(orderItem.productName || orderItem.itemName || ''),
                  option_name: String(orderItem.optionName || orderItem.optionValue || ''),
                  quantity: Number(orderItem.quantity || orderItem.qty || 1),
                  unit_price: Number(orderItem.unitPrice || orderItem.salePrice || 0),
                  channel_product_id: String(orderItem.productId || orderItem.vendorItemId || ''),
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'order_id,megaload_user_id,channel_product_id' });
            }
          }

          totalCollected++;
        }
      } catch (err) {
        channelResults[channel] = -1;
        channelErrors[channel] = err instanceof Error ? err.message : '알 수 없는 오류';
        console.error(`[order-sync] ${channel} error:`, err);
      }
    }

    // sync job 기록
    await serviceClient
      .from('sh_sync_jobs')
      .insert({
        megaload_user_id: shUserId,
        channel: 'all',
        job_type: 'order_sync',
        status: 'completed',
        result: { totalCollected, channels: channelResults },
        completed_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      totalCollected,
      channels: channelResults,
      ...(Object.keys(channelErrors).length > 0 && { errors: channelErrors }),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '주문 수집 실패' }, { status: 500 });
  }
}
