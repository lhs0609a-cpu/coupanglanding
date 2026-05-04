/**
 * 멀티채널 복제 배치 실행기 (크론)
 *
 * GET /api/cron/megaload-replication-runner
 * Auth: Bearer ${CRON_SECRET}
 *
 * 동작:
 * 1) status IN ('pending','running') 인 가장 오래된 잡 1개를 pull
 * 2) cursor 부터 MAX_ITEMS_PER_TICK 건 처리
 * 3) 각 아이템 = (productId, channel) 쌍, adapter.createProduct 호출
 * 4) cursor 갱신, succeeded/failed/skipped 증가
 * 5) 모든 아이템 처리되면 status='completed'
 *
 * 재진입 가능: 한 tick 에 완료 못 한 잡은 다음 tick 에 이어서 처리됨.
 * 여러 잡이 쌓여도 FIFO 로 처리.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { mapCategory } from '@/lib/megaload/services/ai.service';
import { createNotification } from '@/lib/utils/notifications';
import type { Channel } from '@/lib/megaload/types';
import type { BaseAdapter } from '@/lib/megaload/adapters/base.adapter';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const MAX_ITEMS_PER_TICK = 20;   // 타임아웃 회피
const TICK_SOFT_DEADLINE_MS = 240_000;  // maxDuration 300s 중 60s 여유 (메모리 점유 단축)
const PER_ITEM_TIMEOUT_MS = 30_000;     // 단일 채널 등록 1건 30s 한도 — adapter/proxy 와 일치
const MAX_ERROR_LOG_ENTRIES = 50;

/** 단일 비동기 작업에 타임아웃 적용 — 한 건 hang 이 tick 전체를 stall 시키지 않도록 함 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface ReplicationJob {
  id: string;
  megaload_user_id: string;
  target_channels: Channel[];
  product_ids: string[];
  margin_settings: Record<string, number>;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  error_log: Array<{ product_id: string; channel: string; error: string; at: string }>;
  cursor: { productIndex: number; channelIndex: number };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = await createServiceClient();

  // ── 가장 오래된 pending/running 잡 1개 선택 ──
  const { data: jobRow } = await supabase
    .from('sh_replication_jobs')
    .select('*')
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!jobRow) {
    return NextResponse.json({ message: '처리할 잡 없음', tookMs: Date.now() - started });
  }

  const job = jobRow as unknown as ReplicationJob;

  // running 으로 전환
  if (job.status === 'pending') {
    await supabase
      .from('sh_replication_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job.id);
  }

  // ── 머리말/꼬리말 1회 로딩 ──
  const { data: headerRows } = await supabase
    .from('sh_product_headers')
    .select('*')
    .eq('megaload_user_id', job.megaload_user_id);
  const headers = (headerRows || []) as Array<Record<string, unknown>>;

  // ── 어댑터 캐시 (인증 1회) ──
  const adapterCache = new Map<Channel, BaseAdapter>();
  async function getAdapter(channel: Channel): Promise<BaseAdapter> {
    const cached = adapterCache.get(channel);
    if (cached) return cached;
    const adapter = await getAuthenticatedAdapter(supabase, job.megaload_user_id, channel);
    adapterCache.set(channel, adapter);
    return adapter;
  }

  // ── 처리 ──
  let processedThisTick = 0;
  let succeeded = job.succeeded;
  let failed = job.failed;
  let skipped = job.skipped;
  let processed = job.processed;
  const errorLog = [...(job.error_log || [])];
  let { productIndex, channelIndex } = job.cursor || { productIndex: 0, channelIndex: 0 };

  const totalProducts = job.product_ids.length;
  const totalChannels = job.target_channels.length;

  while (
    productIndex < totalProducts &&
    processedThisTick < MAX_ITEMS_PER_TICK &&
    Date.now() - started < TICK_SOFT_DEADLINE_MS
  ) {
    const productId = job.product_ids[productIndex];
    const channel = job.target_channels[channelIndex];

    const result = await withTimeout(
      processItem(supabase, {
        productId,
        channel,
        megaloadUserId: job.megaload_user_id,
        marginPercent: job.margin_settings[channel] ?? 0,
        headers,
        getAdapter,
      }),
      PER_ITEM_TIMEOUT_MS,
      `[${channel}] ${productId.slice(0, 8)}`,
    ).catch<ItemResult>((err) => ({
      outcome: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }));

    processed++;
    processedThisTick++;
    if (result.outcome === 'success') succeeded++;
    else if (result.outcome === 'skipped') skipped++;
    else {
      failed++;
      if (errorLog.length < MAX_ERROR_LOG_ENTRIES) {
        errorLog.push({
          product_id: productId,
          channel,
          error: result.error || 'unknown',
          at: new Date().toISOString(),
        });
      }
    }

    // cursor 진행
    channelIndex++;
    if (channelIndex >= totalChannels) {
      channelIndex = 0;
      productIndex++;
    }
  }

  const isDone = productIndex >= totalProducts;
  const updatePayload: Record<string, unknown> = {
    processed,
    succeeded,
    failed,
    skipped,
    error_log: errorLog,
    cursor: { productIndex, channelIndex },
  };
  if (isDone) {
    updatePayload.status = 'completed';
    updatePayload.completed_at = new Date().toISOString();
  }

  await supabase
    .from('sh_replication_jobs')
    .update(updatePayload)
    .eq('id', job.id);

  // ── 완료 시 인앱 알림 ──
  if (isDone) {
    try {
      // megaload_user → profile_id 조회
      const { data: shUser } = await supabase
        .from('megaload_users')
        .select('profile_id')
        .eq('id', job.megaload_user_id)
        .single();

      const profileId = (shUser as Record<string, unknown> | null)?.profile_id as string | undefined;
      if (profileId) {
        const productCount = job.product_ids.length;
        const channelCount = job.target_channels.length;
        const title = failed === 0
          ? '멀티채널 복제 완료'
          : `멀티채널 복제 완료 (실패 ${failed}건)`;
        const message = failed === 0
          ? `${productCount}개 상품을 ${channelCount}개 채널에 모두 등록했습니다. (성공 ${succeeded}${skipped > 0 ? `, 건너뜀 ${skipped}` : ''})`
          : `성공 ${succeeded} · 실패 ${failed}${skipped > 0 ? ` · 건너뜀 ${skipped}` : ''} / 전체 ${job.total}건. 실패 로그를 확인해주세요.`;

        await createNotification(supabase, {
          userId: profileId,
          type: 'system',
          title,
          message,
          link: `/megaload/products/replications?job=${job.id}`,
        });
      }
    } catch (notifyErr) {
      console.warn('[replication-runner] notification 실패:', notifyErr);
    }
  }

  return NextResponse.json({
    jobId: job.id,
    processedThisTick,
    processed,
    total: job.total,
    succeeded,
    failed,
    skipped,
    status: isDone ? 'completed' : 'running',
    tookMs: Date.now() - started,
  });
}

// ────────────────────────────────────────────────
// 단일 아이템 처리
// ────────────────────────────────────────────────

interface ItemContext {
  productId: string;
  channel: Channel;
  megaloadUserId: string;
  marginPercent: number;
  headers: Array<Record<string, unknown>>;
  getAdapter: (channel: Channel) => Promise<BaseAdapter>;
}

type ItemResult =
  | { outcome: 'success'; channelProductId: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; error: string };

async function processItem(supabase: SupabaseClient, ctx: ItemContext): Promise<ItemResult> {
  try {
    // ── 중복 등록 체크 ──
    //   - active/pending 모두 skip (pending = 이전 tick 이 createProduct 직전에 placeholder 박은 상태)
    //   - failed/deleted 는 재시도 허용
    const { data: existing } = await supabase
      .from('sh_product_channels')
      .select('channel_product_id, status')
      .eq('product_id', ctx.productId)
      .eq('channel', ctx.channel)
      .maybeSingle();

    const ex = existing as Record<string, unknown> | null;
    if (ex && ex.status !== 'deleted' && ex.status !== 'failed') {
      // pending 인데 채널ID가 없으면 → 이전 시도가 중단된 placeholder. 안전하게 skip(수동 정리 필요).
      // active(channel_product_id 보유) → 정상 완료 상태. skip.
      return { outcome: 'skipped', reason: ex.channel_product_id ? 'already-registered' : 'pending-from-previous-tick' };
    }

    // ── 상품 로드 (서비스 클라이언트는 RLS bypass — megaload_user_id 명시 필터로 cross-tenant 차단) ──
    const { data: productRow } = await supabase
      .from('sh_products')
      .select('*, sh_product_options(*)')
      .eq('id', ctx.productId)
      .eq('megaload_user_id', ctx.megaloadUserId)
      .single();

    if (!productRow) return { outcome: 'failed', error: '상품을 찾을 수 없습니다' };

    const product = productRow as Record<string, unknown>;
    const productName = product.product_name as string;
    const categoryId = product.category_id as string | null;
    const rawData = (product.raw_data as Record<string, unknown>) || {};
    const options = (product.sh_product_options as Array<Record<string, unknown>>) || [];

    // ── 기준 가격: 첫 옵션의 sale_price (없으면 raw_data.sellerProductPrice) ──
    const basePrice = Number(options[0]?.sale_price || rawData.sellerProductPrice || 0);
    if (basePrice <= 0) {
      return { outcome: 'failed', error: '판매가 정보 없음' };
    }

    const adjustedPrice = Math.round(basePrice * (1 + (ctx.marginPercent || 0) / 100));

    // ── 카테고리 매핑 (AI + 캐시) ──
    let channelCategoryId: string | null = null;
    let channelCategoryName: string | null = null;
    let categoryConfidence: number | null = null;

    if (categoryId) {
      const { data: cached } = await supabase
        .from('sh_category_mappings')
        .select('channel_category_id, channel_category_name, confidence')
        .eq('megaload_user_id', ctx.megaloadUserId)
        .eq('source_category_id', categoryId)
        .eq('channel', ctx.channel)
        .maybeSingle();

      const c = cached as Record<string, unknown> | null;
      if (c?.channel_category_id) {
        channelCategoryId = c.channel_category_id as string;
        channelCategoryName = c.channel_category_name as string | null;
        categoryConfidence = c.confidence as number | null;
      } else {
        const mapping = await mapCategory(productName, categoryId, ctx.channel);
        channelCategoryId = mapping.categoryId || null;
        channelCategoryName = mapping.categoryName || null;
        categoryConfidence = mapping.confidence || null;

        if (channelCategoryId) {
          await supabase
            .from('sh_category_mappings')
            .upsert({
              megaload_user_id: ctx.megaloadUserId,
              source_category_id: categoryId,
              channel: ctx.channel,
              channel_category_id: channelCategoryId,
              channel_category_name: channelCategoryName,
              confidence: categoryConfidence,
              is_ai_generated: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'megaload_user_id,source_category_id,channel' });
        }
      }
    }

    // ── 머리말/꼬리말 ──
    const header = ctx.headers.find((h) => h.channel === ctx.channel && h.type === 'header');
    const footer = ctx.headers.find((h) => h.channel === ctx.channel && h.type === 'footer');
    const headerHtml = (header?.content as string) || '';
    const footerHtml = (footer?.content as string) || '';

    // ── 멱등성 placeholder: 채널 호출 전에 'pending' 행을 미리 박아둠 ──
    //   - createProduct 성공 후 sh_product_channels.upsert 가 실패하면 (DB 장애 등)
    //     cursor 가 진행 안 되어 다음 tick 에 동일 상품이 재호출 → 채널에 중복 등록.
    //   - 사전에 placeholder 를 박아두면 중복 등록 방지(상단 dedup 가드가 'pending' 도 차단).
    //   - upsert 실패 시 즉시 에러 반환 → 다음 tick 에서 createProduct 호출 안 됨.
    const placeholder = await supabase
      .from('sh_product_channels')
      .upsert({
        product_id: ctx.productId,
        megaload_user_id: ctx.megaloadUserId,
        channel: ctx.channel,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,channel' });
    if (placeholder.error) {
      return { outcome: 'failed', error: `placeholder DB 실패: ${placeholder.error.message}` };
    }

    // ── 어댑터 호출 ──
    const adapter = await ctx.getAdapter(ctx.channel);
    const channelProduct = {
      productName,
      categoryId: channelCategoryId || categoryId,
      description: `${headerHtml}${(rawData.content as string) || ''}${footerHtml}`,
      salePrice: adjustedPrice,
      options,
      images: (rawData.images as unknown[]) || [],
    };

    const result = await adapter.createProduct(channelProduct as Record<string, unknown>);

    // ── 매핑 갱신 (placeholder → 실제 channel_product_id) ──
    const finalize = await supabase
      .from('sh_product_channels')
      .upsert({
        product_id: ctx.productId,
        megaload_user_id: ctx.megaloadUserId,
        channel: ctx.channel,
        channel_product_id: result.channelProductId,
        status: 'active',
        price_rule: { mode: 'margin', margin_percent: ctx.marginPercent, base_price: basePrice, final_price: adjustedPrice },
        channel_category_id: channelCategoryId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,channel' });
    if (finalize.error) {
      // 채널엔 등록 성공 / DB 갱신 실패 — orphan 발생. 에러 로그에 명시적으로 기록.
      console.error(`[replication-runner] orphan: ${ctx.channel}/${result.channelProductId} DB 갱신 실패:`, finalize.error);
      return { outcome: 'failed', error: `채널 등록(${result.channelProductId}) 성공이나 DB 갱신 실패: ${finalize.error.message}` };
    }

    return { outcome: 'success', channelProductId: result.channelProductId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '등록 실패';

    // 실패 상태도 매핑에 기록 (재시도 시 덮어쓰기)
    try {
      await supabase
        .from('sh_product_channels')
        .upsert({
          product_id: ctx.productId,
          channel: ctx.channel,
          status: 'failed',
          error_message: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id,channel' });
    } catch { /* ignore */ }

    return { outcome: 'failed', error: msg };
  }
}
