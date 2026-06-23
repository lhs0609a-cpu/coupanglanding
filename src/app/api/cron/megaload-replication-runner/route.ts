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
import { buildCanonical, canonicalHash } from '@/lib/megaload/services/canonical-product';
import type { ChannelMappingContext, ChannelShippingTemplate } from '@/lib/megaload/services/canonical-product';
import { mapForChannel } from '@/lib/megaload/services/replication-mapper';
import { loadShippingTemplates } from '@/lib/megaload/services/shipping-template';
import { checkCertRequired } from '@/lib/megaload/services/cert-category-guard';
import { checkPriceGuard } from '@/lib/megaload/services/cross-channel-price-guard';
import { rehostImages, extractImageUrls } from '@/lib/megaload/services/channel-image-rehost';
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

  // ── 배송/반품/AS 템플릿 1회 로딩 (채널별) ──
  const shippingTemplates = await loadShippingTemplates(supabase, job.megaload_user_id);

  // ── 인증 카테고리 ack 1회 로딩 (운영자가 보유 확인한 인증 라벨) ──
  const { data: certUserRow } = await supabase
    .from('megaload_users')
    .select('cert_acknowledged')
    .eq('id', job.megaload_user_id)
    .single();
  const certAcknowledged = ((certUserRow as Record<string, unknown> | null)?.cert_acknowledged as string[]) || [];

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
        shippingTemplate: shippingTemplates.get(channel) ?? null,
        certAcknowledged,
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
    // needs_input = 필수값 누락으로 보류(예외큐). 실패가 아니므로 skipped 로 집계, 상태는 채널 행에 보존.
    else if (result.outcome === 'skipped' || result.outcome === 'needs_input') skipped++;
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
  shippingTemplate: ChannelShippingTemplate | null;
  certAcknowledged: string[];
  getAdapter: (channel: Channel) => Promise<BaseAdapter>;
}

type ItemResult =
  | { outcome: 'success'; channelProductId: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'needs_input'; fields: string[] }
  | { outcome: 'failed'; error: string };

async function processItem(supabase: SupabaseClient, ctx: ItemContext): Promise<ItemResult> {
  try {
    // ── 현재 상태 조회 ──
    //   - 진행중/보류(pending/registering/needs_input/queued/mapping)는 스킵(중복호출·파킹)
    //   - active 는 변경감지(해시) 위해 통과 → 동일하면 스킵, 다르면 updateProduct(라이프사이클 전파)
    //   - failed/deleted/없음 → createProduct
    const { data: existing } = await supabase
      .from('sh_product_channels')
      .select('channel_product_id, status, last_pushed_hash')
      .eq('product_id', ctx.productId)
      .eq('channel', ctx.channel)
      .maybeSingle();

    const ex = existing as Record<string, unknown> | null;
    const exStatus = ex?.status as string | undefined;
    if (exStatus && ['pending', 'registering', 'needs_input', 'queued', 'mapping'].includes(exStatus)) {
      return { outcome: 'skipped', reason: `in-flight:${exStatus}` };
    }

    // ── Canonical 조립 (채널 독립 마스터) ──
    const canonical = await buildCanonical(supabase, ctx.productId, ctx.megaloadUserId);
    if (!canonical) return { outcome: 'failed', error: '상품을 찾을 수 없습니다' };

    const categoryId = canonical.internalCategoryId;

    // ── 기준 가격: 첫 옵션 판매가(없으면 소스가) ──
    const basePrice = canonical.options[0]?.salePrice || canonical.sourcePrice || 0;
    if (basePrice <= 0) {
      return { outcome: 'failed', error: '판매가 정보 없음' };
    }
    const adjustedPrice = Math.round(basePrice * (1 + (ctx.marginPercent || 0) / 100));

    // ── 안전 가드 (채널 호출 전): 인증필요 카테고리 + 가격정합 ──
    //   위반 시 채널 API 호출 없이 needs_input/blocked 로 보류 (위법 리스팅·역마진·쿠팡 최저가 위반 차단)
    const guardMissing = [
      ...checkCertRequired(canonical, ctx.certAcknowledged),
      ...checkPriceGuard({
        basePrice,
        adjustedPrice,
        costPrice: canonical.options[0]?.costPrice ?? null,
        marginPercent: ctx.marginPercent || 0,
      }),
    ];
    if (guardMissing.length > 0) {
      await supabase
        .from('sh_product_channels')
        .upsert({
          product_id: ctx.productId,
          megaload_user_id: ctx.megaloadUserId,
          channel: ctx.channel,
          status: 'needs_input',
          needs_input_fields: guardMissing,
          error_message: guardMissing.map((m) => m.reason).join('; ').slice(0, 500),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id,channel' });
      return { outcome: 'needs_input', fields: guardMissing.map((m) => m.field) };
    }

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
      } else {
        const mapping = await mapCategory(canonical.name, categoryId, ctx.channel);
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

    // ── Canonical → 채널 페이로드 매핑 (채널 지식은 어댑터 안에서; ACL) ──
    const adapter = await ctx.getAdapter(ctx.channel);

    // ── 이미지 재호스팅 (네이버 등 selfHostedImages 채널) — 매핑 전 미리 업로드 ──
    let rehostedImages: Map<string, string> | undefined;
    if (adapter.capabilities.selfHostedImages) {
      const urls = [
        ...canonical.images.map((i) => i.url),
        ...extractImageUrls(canonical.detailHtml),
        ...extractImageUrls(`${headerHtml}${footerHtml}`),
      ].slice(0, 30); // per-item 30s 예산 보호 (캐시로 다음 사이클 가속)
      rehostedImages = await rehostImages(supabase, adapter, {
        megaloadUserId: ctx.megaloadUserId,
        channel: ctx.channel,
        urls,
      });
    }

    const mappingCtx: ChannelMappingContext = {
      channel: ctx.channel,
      channelCategoryId,
      sellingPrice: adjustedPrice,
      marginPercent: ctx.marginPercent || 0,
      headerHtml,
      footerHtml,
      shippingTemplate: ctx.shippingTemplate,
      rehostedImages,
    };
    const mapped = mapForChannel(adapter, canonical, mappingCtx);
    const mappingHash = canonicalHash(canonical);

    // ── needs_input: 채널 호출 없이 보류 기록 (예외큐 노출, 그 채널만 보류) ──
    if (!mapped.ok) {
      await supabase
        .from('sh_product_channels')
        .upsert({
          product_id: ctx.productId,
          megaload_user_id: ctx.megaloadUserId,
          channel: ctx.channel,
          status: 'needs_input',
          needs_input_fields: mapped.missing,
          mapping_hash: mappingHash,
          channel_category_id: channelCategoryId,
          error_message: mapped.missing.map((m) => m.reason).join('; ').slice(0, 500),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id,channel' });
      return { outcome: 'needs_input', fields: mapped.missing.map((m) => m.field) };
    }

    // ── 라이프사이클 전파: 이미 active 면 변경(해시) 감지 → updateProduct, 무변경 → 스킵 ──
    if (ex && ex.status === 'active' && ex.channel_product_id) {
      const channelProductId = ex.channel_product_id as string;
      if (ex.last_pushed_hash === mappingHash) {
        // 실변경 없음 — last_synced_at 만 갱신해 reconcile 재플래그 중단
        await supabase
          .from('sh_product_channels')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('product_id', ctx.productId)
          .eq('channel', ctx.channel);
        return { outcome: 'skipped', reason: 'no-change' };
      }
      // 쿠팡 원본 변경 → 채널 리스팅 업데이트
      await adapter.updateProduct(channelProductId, mapped.payload);
      const upd = await supabase
        .from('sh_product_channels')
        .update({
          status: 'active',
          price_rule: { mode: 'margin', margin_percent: ctx.marginPercent, base_price: basePrice, final_price: adjustedPrice },
          channel_category_id: channelCategoryId,
          mapping_hash: mappingHash,
          last_pushed_hash: mappingHash,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('product_id', ctx.productId)
        .eq('channel', ctx.channel);
      if (upd.error) {
        return { outcome: 'failed', error: `채널 업데이트 성공이나 DB 갱신 실패: ${upd.error.message}` };
      }
      return { outcome: 'success', channelProductId };
    }

    // ── 멱등성 placeholder: 채널 호출 전에 'registering' 행을 미리 박아둠 ──
    //   createProduct 성공 후 DB 갱신 실패 시에도 dedup 가드가 재호출을 차단(중복 등록 방지).
    const placeholder = await supabase
      .from('sh_product_channels')
      .upsert({
        product_id: ctx.productId,
        megaload_user_id: ctx.megaloadUserId,
        channel: ctx.channel,
        status: 'registering',
        mapping_hash: mappingHash,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,channel' });
    if (placeholder.error) {
      return { outcome: 'failed', error: `placeholder DB 실패: ${placeholder.error.message}` };
    }

    // ── 어댑터 호출 ──
    const result = await adapter.createProduct(mapped.payload);

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
        mapping_hash: mappingHash,
        last_pushed_hash: mappingHash,
        needs_input_fields: [],
        last_error_class: null,
        last_synced_at: new Date().toISOString(),
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
