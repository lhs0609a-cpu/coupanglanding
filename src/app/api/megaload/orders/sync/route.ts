import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAllAuthenticatedAdapters } from '@/lib/megaload/adapters/factory';
import { CHANNEL_ORDER_STATUS_MAP } from '@/lib/megaload/constants';
import type { Channel, OrderStatus } from '@/lib/megaload/types';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


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
          // 쿠팡: 발주확인/송장등록 API가 shipmentBoxId 기준이므로 이를 우선 사용
          const channelOrderId = String(item.shipmentBoxId || item.orderId || item.orderNo || item.productOrderId || '');
          if (!channelOrderId) continue;

          const rawStatus = String(item.status || item.orderStatus || '');
          const orderStatus = normalizeOrderStatus(channel, rawStatus);

          const receiverName = String(item.receiverName || (item.receiver as Record<string, unknown>)?.name || '');
          const receiverPhone = String(item.receiverPhone || (item.receiver as Record<string, unknown>)?.tel1 || '');
          const receiverAddress = String(item.receiverAddress || (item.receiver as Record<string, unknown>)?.addr1 || '');
          const orderedAt = String(item.orderedAt || item.orderDate || item.paymentDate || new Date().toISOString());
          const totalPrice = Number(item.totalPrice || item.paymentAmount || item.settlePrice || 0);
          const buyerName = String(item.buyerName || (item.orderer as Record<string, unknown>)?.name || '');

          // 주문 저장 — sh_orders 에는 (megaload_user_id,channel,channel_order_id)
          // 유니크 제약이 없어 upsert(onConflict) 가 42P10 으로 실패한다.
          // 자연키로 직접 조회 후 update/insert 로 멱등 저장한다.
          const orderPayload = {
            megaload_user_id: shUserId,
            channel,
            channel_order_id: channelOrderId,
            order_status: orderStatus,
            buyer_name: buyerName,
            receiver_name: receiverName,
            receiver_phone: receiverPhone,
            receiver_address: receiverAddress,
            total_amount: totalPrice,
            ordered_at: orderedAt,
            raw_data: item,
            updated_at: new Date().toISOString(),
          };

          const { data: existingOrder } = await serviceClient
            .from('sh_orders')
            .select('id')
            .eq('megaload_user_id', shUserId)
            .eq('channel', channel)
            .eq('channel_order_id', channelOrderId)
            .maybeSingle();

          let orderId = (existingOrder as Record<string, unknown>)?.id as string | undefined;
          if (orderId) {
            const { error: updErr } = await serviceClient.from('sh_orders').update(orderPayload).eq('id', orderId);
            if (updErr) throw new Error(`sh_orders update: ${updErr.message}`);
          } else {
            const { data: inserted, error: insErr } = await serviceClient
              .from('sh_orders').insert(orderPayload).select('id').single();
            if (insErr) throw new Error(`sh_orders insert: ${insErr.message}`);
            orderId = (inserted as Record<string, unknown>)?.id as string;
          }

          // 주문 상품 저장 — sh_order_items 는 order_id 로 delete 후 재삽입(멱등).
          // (megaload_user_id/updated_at 컬럼은 스키마에 없으므로 넣지 않는다)
          if (orderId) {
            const lineItems = (item.orderItems || item.productOrderItems || []) as Record<string, unknown>[];
            await serviceClient.from('sh_order_items').delete().eq('order_id', orderId);
            if (lineItems.length > 0) {
              const rows = lineItems.map((orderItem) => ({
                order_id: orderId,
                product_name: String(orderItem.productName || orderItem.itemName || ''),
                option_name: String(orderItem.optionName || orderItem.optionValue || ''),
                quantity: Number(orderItem.quantity || orderItem.qty || 1),
                unit_price: Number(orderItem.unitPrice || orderItem.salePrice || 0),
                channel_product_id: String(orderItem.productId || orderItem.vendorItemId || ''),
              }));
              await serviceClient.from('sh_order_items').insert(rows);
            }
          }

          totalCollected++;
        }
      } catch (err) {
        channelResults[channel] = -1;
        channelErrors[channel] = err instanceof Error ? err.message : '알 수 없는 오류';
        console.error(`[order-sync] ${channel} error:`, err);
        void logSystemError({ source: 'megaload/orders/sync', error: err }).catch(() => {});
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
