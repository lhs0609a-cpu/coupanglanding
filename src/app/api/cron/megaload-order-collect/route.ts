import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAllAuthenticatedAdapters } from '@/lib/megaload/adapters/factory';
import { CHANNEL_ORDER_STATUS_MAP } from '@/lib/megaload/constants';
import type { Channel, OrderStatus } from '@/lib/megaload/types';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300;

function normalizeOrderStatus(channel: Channel, rawStatus: string): OrderStatus {
  return CHANNEL_ORDER_STATUS_MAP[channel]?.[rawStatus] || 'payment_done';
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // 모든 활성 셀러 조회
  const { data: users } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('onboarding_done', true);

  if (!users || users.length === 0) {
    return NextResponse.json({ message: '활성 셀러 없음' });
  }

  let totalCollected = 0;
  let totalErrors = 0;

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const user of users) {
    const shUserId = (user as Record<string, unknown>).id as string;

    try {
      const adapters = await getAllAuthenticatedAdapters(supabase, shUserId);

      for (const { channel, adapter } of adapters) {
        try {
          const result = await adapter.getOrders({ startDate, endDate });

          for (const item of result.items) {
            const channelOrderId = String(item.orderId || item.orderNo || item.productOrderId || '');
            if (!channelOrderId) continue;

            const rawStatus = String(item.status || item.orderStatus || '');
            const orderStatus = normalizeOrderStatus(channel, rawStatus);
            const totalPrice = Number(item.totalPrice || item.paymentAmount || 0);

            await supabase
              .from('sh_orders')
              .upsert({
                megaload_user_id: shUserId,
                channel,
                channel_order_id: channelOrderId,
                order_status: orderStatus,
                buyer_name: String(item.buyerName || (item.orderer as Record<string, unknown>)?.name || ''),
                receiver_name: String(item.receiverName || (item.receiver as Record<string, unknown>)?.name || ''),
                receiver_phone: String(item.receiverPhone || (item.receiver as Record<string, unknown>)?.tel1 || ''),
                receiver_address: String(item.receiverAddress || (item.receiver as Record<string, unknown>)?.addr1 || ''),
                total_price: totalPrice,
                ordered_at: String(item.orderedAt || item.orderDate || new Date().toISOString()),
                raw_data: item,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'megaload_user_id,channel,channel_order_id' });

            // 재고 차감 (신규 주문만)
            const orderItems = (item.orderItems || item.productOrderItems || []) as Record<string, unknown>[];
            for (const oi of orderItems) {
              const sku = String(oi.sellerItemCode || oi.vendorSku || '');
              if (!sku) continue;

              const qty = Number(oi.quantity || oi.qty || 1);
              const { data: inv } = await supabase
                .from('sh_inventory')
                .select('id, quantity')
                .eq('megaload_user_id', shUserId)
                .eq('sku', sku)
                .maybeSingle();

              if (inv) {
                const invData = inv as Record<string, unknown>;
                const newQty = Math.max(0, (invData.quantity as number) - qty);
                await supabase
                  .from('sh_inventory')
                  .update({ quantity: newQty, updated_at: new Date().toISOString() })
                  .eq('id', invData.id);

                await supabase
                  .from('sh_inventory_logs')
                  .insert({
                    inventory_id: invData.id,
                    megaload_user_id: shUserId,
                    change_type: 'SALE',
                    quantity_change: -qty,
                    quantity_before: invData.quantity,
                    quantity_after: newQty,
                    reference_id: channelOrderId,
                    note: `${channel} 주문`,
                  });
              }
            }

            totalCollected++;
          }
        } catch (err) {
          totalErrors++;
          console.error(`[order-collect] ${shUserId}/${channel}:`, err);
          void logSystemError({ source: 'cron/megaload-order-collect', error: err }).catch(() => {});
        }
      }
    } catch {
      totalErrors++;
    }
  }

  return NextResponse.json({ success: true, totalCollected, totalErrors, usersProcessed: users.length });
}
