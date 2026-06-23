/**
 * 채널 배송/반품/AS 템플릿 — 로드/변환 공유 헬퍼
 * 러너(주입)와 API(CRUD)가 같은 변환·완성도 판정을 쓰도록 단일화.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Channel } from '../types';
import type { ChannelShippingTemplate } from './canonical-product';

export function rowToTemplate(row: Record<string, unknown>): ChannelShippingTemplate {
  return {
    outboundPlaceCode: (row.outbound_place_code as string) || undefined,
    returnCenterCode: (row.return_center_code as string) || undefined,
    deliveryChargeType:
      (row.delivery_charge_type as ChannelShippingTemplate['deliveryChargeType']) || 'FREE',
    deliveryCharge: row.delivery_charge != null ? Number(row.delivery_charge) : 0,
    freeShipOverAmount: row.free_ship_over_amount != null ? Number(row.free_ship_over_amount) : 0,
    returnCharge: row.return_charge != null ? Number(row.return_charge) : 0,
    exchangeCharge: row.exchange_charge != null ? Number(row.exchange_charge) : 0,
    afterServiceTel: (row.after_service_tel as string) || undefined,
    afterServiceGuide: (row.after_service_guide as string) || undefined,
    originCode: (row.origin_code as string) || undefined,
    originContent: (row.origin_content as string) || undefined,
  };
}

/** 등록에 필요한 최소 필수값이 다 찼는가 (출고지·반품지·AS) */
export function isTemplateComplete(t: ChannelShippingTemplate): boolean {
  return Boolean(t.outboundPlaceCode && t.returnCenterCode && t.afterServiceTel && t.afterServiceGuide);
}

/** 사용자의 채널별 배송 템플릿을 Map 으로 로드 (러너 1회 호출) */
export async function loadShippingTemplates(
  supabase: SupabaseClient,
  megaloadUserId: string,
): Promise<Map<Channel, ChannelShippingTemplate>> {
  const { data } = await supabase
    .from('sh_channel_shipping_templates')
    .select('*')
    .eq('megaload_user_id', megaloadUserId);

  const map = new Map<Channel, ChannelShippingTemplate>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    map.set(row.channel as Channel, rowToTemplate(row));
  }
  return map;
}
