/**
 * 멀티채널 라이프사이클 전파 — 삭제
 *
 * 쿠팡(소스) 상품이 삭제(sh_products.status='deleted')되면 쿠팡 외 전 채널 active
 * 리스팅도 삭제. (가격/내용 변경=update 전파는 러너의 해시감지가 담당)
 *
 * 안전: MULTICHANNEL_LIFECYCLE_KILLSWITCH=1 정지 / MULTICHANNEL_LIFECYCLE_DRY_RUN=1 로깅만.
 * 채널별 실패는 격리. 멱등(active 만 대상 → 한 번 삭제되면 다음 틱엔 no-op).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BaseAdapter } from '../adapters/base.adapter';
import { getAuthenticatedAdapter } from '../adapters/factory';
import type { Channel } from '../types';

const KILLSWITCH = process.env.MULTICHANNEL_LIFECYCLE_KILLSWITCH === '1';
const DRY_RUN = process.env.MULTICHANNEL_LIFECYCLE_DRY_RUN === '1';

export interface DeletePropagateResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

export async function propagateProductDeletion(
  supabase: SupabaseClient,
  opts: { productId: string; megaloadUserId: string; adapterCache?: Map<Channel, BaseAdapter> },
): Promise<DeletePropagateResult> {
  const empty: DeletePropagateResult = { attempted: 0, succeeded: 0, failed: 0 };
  if (KILLSWITCH) return empty;

  const { data: rows } = await supabase
    .from('sh_product_channels')
    .select('channel, channel_product_id')
    .eq('product_id', opts.productId)
    .neq('channel', 'coupang')
    .eq('status', 'active')
    .not('channel_product_id', 'is', null);

  const listings = (rows || []) as Array<{ channel: Channel; channel_product_id: string }>;
  if (listings.length === 0) return empty;

  const cache = opts.adapterCache ?? new Map<Channel, BaseAdapter>();
  let succeeded = 0;
  let failed = 0;

  for (const l of listings) {
    if (DRY_RUN) {
      succeeded++;
      continue;
    }
    try {
      let adapter = cache.get(l.channel);
      if (!adapter) {
        adapter = await getAuthenticatedAdapter(supabase, opts.megaloadUserId, l.channel);
        cache.set(l.channel, adapter);
      }
      await adapter.deleteProduct(l.channel_product_id);
      await supabase
        .from('sh_product_channels')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('product_id', opts.productId)
        .eq('channel', l.channel);
      succeeded++;
    } catch (e) {
      failed++;
      console.error(
        `[multichannel-lifecycle] ${l.channel} 삭제 전파 실패 (${l.channel_product_id}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { attempted: listings.length, succeeded, failed };
}
