/**
 * 멀티채널 재고 전파 — 오버셀(중복판매) 방지
 *
 * 공급사(네이버 등) 품절/재입고를 stock-monitor 엔진이 감지하면,
 * 쿠팡 외 모든 채널 리스팅(sh_product_channels)에 재고를 동시에 반영한다.
 *   - soldOut=true  → 전 채널 재고 0 (구매 불가)
 *   - soldOut=false → 전 채널 재고 RESTOCK_QTY 로 복구
 *
 * ⚠️ 쿠팡은 여기서 다루지 않는다 — 엔진이 suspend/resume 으로 별도 처리(검증된 경로).
 *    무재고 위탁 모델 기준: 채널별 실제 보유 수량이 없으므로 0 ↔ 정찰값(RESTOCK_QTY) 토글.
 *
 * 안전장치(실제 마켓 재고 쓰기이므로 롤아웃 보호):
 *   - MULTICHANNEL_STOCK_KILLSWITCH=1 : 전파 전체 정지
 *   - MULTICHANNEL_STOCK_DRY_RUN=1    : 실제 호출 없이 성공으로 로깅만
 *   - MULTICHANNEL_RESTOCK_QTY        : 재입고 시 복구 수량 (기본 999)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BaseAdapter } from '../adapters/base.adapter';
import { getAuthenticatedAdapter } from '../adapters/factory';
import type { Channel } from '../types';

const KILLSWITCH = process.env.MULTICHANNEL_STOCK_KILLSWITCH === '1';
const DRY_RUN = process.env.MULTICHANNEL_STOCK_DRY_RUN === '1';
const RESTOCK_QTY = (() => {
  const n = Number(process.env.MULTICHANNEL_RESTOCK_QTY || '999');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 999;
})();

export interface ChannelSyncOutcome {
  channel: Channel;
  channelProductId: string;
  target: 'zero' | 'restock';
  success: boolean;
  error?: string;
  dryRun?: boolean;
}

export interface PropagateResult {
  attempted: number;
  succeeded: number;
  failed: number;
  outcomes: ChannelSyncOutcome[];
  /** 호출 자체를 건너뛴 사유 (killswitch / db 오류 등). attempted=0 과 함께 사용. */
  skippedReason?: string;
}

const EMPTY: PropagateResult = { attempted: 0, succeeded: 0, failed: 0, outcomes: [] };

/**
 * 공급사 품절/재입고를 쿠팡 외 전 채널 리스팅에 전파.
 * 채널별 실패는 격리되어(try/catch) 나머지 채널 처리를 막지 않는다.
 */
export async function propagateStockToOtherChannels(
  supabase: SupabaseClient,
  opts: {
    productId: string;
    megaloadUserId: string;
    soldOut: boolean;
    /** 배치 내 채널별 어댑터 재인증 회피용 캐시 (선택) */
    adapterCache?: Map<Channel, BaseAdapter>;
  },
): Promise<PropagateResult> {
  if (KILLSWITCH) return { ...EMPTY, skippedReason: 'killswitch' };

  // 쿠팡 외, 채널상품ID 보유, 등록(active/suspended) 상태인 리스팅만 대상
  const { data: rows, error } = await supabase
    .from('sh_product_channels')
    .select('channel, channel_product_id, status')
    .eq('product_id', opts.productId)
    .neq('channel', 'coupang')
    .not('channel_product_id', 'is', null);

  if (error) return { ...EMPTY, skippedReason: `db: ${error.message}` };

  const listings = ((rows || []) as Array<Record<string, unknown>>)
    .filter((r) => r.status === 'active' || r.status === 'suspended')
    .map((r) => ({
      channel: r.channel as Channel,
      channelProductId: r.channel_product_id as string,
    }));

  if (listings.length === 0) return { ...EMPTY };

  const cache = opts.adapterCache ?? new Map<Channel, BaseAdapter>();
  const targetQty = opts.soldOut ? 0 : RESTOCK_QTY;
  const target: 'zero' | 'restock' = opts.soldOut ? 'zero' : 'restock';
  const outcomes: ChannelSyncOutcome[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const listing of listings) {
    const base: ChannelSyncOutcome = {
      channel: listing.channel,
      channelProductId: listing.channelProductId,
      target,
      success: false,
    };

    if (DRY_RUN) {
      outcomes.push({ ...base, success: true, dryRun: true });
      succeeded++;
      continue;
    }

    try {
      let adapter = cache.get(listing.channel);
      if (!adapter) {
        adapter = await getAuthenticatedAdapter(supabase, opts.megaloadUserId, listing.channel);
        cache.set(listing.channel, adapter);
      }

      await adapter.updateStock(listing.channelProductId, targetQty);
      outcomes.push({ ...base, success: true });
      succeeded++;

      // 동기화 시각 기록 (status 는 유지 — '재고 0' 방식이라 active 그대로 둠)
      await supabase
        .from('sh_product_channels')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('product_id', opts.productId)
        .eq('channel', listing.channel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'updateStock 실패';
      outcomes.push({ ...base, error: msg.slice(0, 300) });
      failed++;
      console.error(
        `[multichannel-stock-sync] ${listing.channel}/${listing.channelProductId} ${target} 실패:`,
        msg,
      );
    }
  }

  return { attempted: listings.length, succeeded, failed, outcomes };
}
