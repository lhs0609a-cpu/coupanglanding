/**
 * 멀티채널 자동전파 reconcile (백스톱 크론) — Phase 0
 *
 * GET /api/cron/megaload-replication-reconcile
 * Auth: Bearer ${CRON_SECRET}
 *
 * 동작:
 *  - auto_replicate_enabled=true 인 사용자마다
 *  - "쿠팡 active 상품 ⨉ 연결된 대상 채널" 의 결손(미등록 / 백오프 경과한 실패)을 찾아
 *  - 기존 sh_replication_jobs 큐에 자동 투입 → megaload-replication-runner 가 처리
 *
 * 이게 "저절로 뿌려짐"의 심장 — inline hook 이 죽어도, 채널을 뒤늦게 연동해도
 * 결국 모든 쿠팡 상품이 모든 대상 채널로 수렴(eventually consistent)한다.
 *
 * 안전장치:
 *  - MULTICHANNEL_AUTOFANOUT_KILLSWITCH=1 → 전면 정지
 *  - 사용자별 pending/running 잡이 이미 있으면 새 잡 안 만듦(파일업·중복 방지)
 *  - 사용자/사이클당 상품 상한(버스트 방지)
 *  - failed 는 백오프 경과분만 재투입(재시도 폭주 방지)
 *
 * ⚠️ 멱등: 같은 (상품,채널)을 과투입해도 러너의 dedup 가드가 건너뛴다.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { enqueueReplicationJob } from '@/lib/megaload/services/replication-enqueue';
import { propagateProductDeletion } from '@/lib/megaload/services/multichannel-lifecycle';
import { isChannelSupported } from '@/lib/megaload/types';
import type { Channel } from '@/lib/megaload/types';
import type { BaseAdapter } from '@/lib/megaload/adapters/base.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 120;

const KILLSWITCH = process.env.MULTICHANNEL_AUTOFANOUT_KILLSWITCH === '1';

/** 사용자/사이클당 새로 큐잉할 상품 상한 — 신규채널 연동 시 수천건 일시 유입 방지 */
const MAX_PRODUCTS_PER_USER = 100;
/** 쿠팡 active 상품 스캔 상한(최신순) — 풀스캔 비용 캡 */
const SCAN_LIMIT = 500;
/** failed 재시도 백오프 (P1에서 attempt_count 기반 지수 백오프로 대체) */
const FAILED_BACKOFF_MS = 2 * 60 * 60 * 1000; // 2시간

interface ChannelRow {
  product_id: string;
  channel: string;
  status: string;
  last_synced_at: string | null;
  updated_at: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (KILLSWITCH) {
    return NextResponse.json({ message: 'killswitch on', skipped: true });
  }

  const started = Date.now();
  const supabase = await createServiceClient();

  // 자동전파 켠 사용자만
  const { data: users } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('auto_replicate_enabled', true);

  if (!users || users.length === 0) {
    return NextResponse.json({ message: '자동전파 사용자 없음', tookMs: Date.now() - started });
  }

  const nowMs = Date.now();
  const summary: Array<Record<string, unknown>> = [];

  for (const u of users) {
    const userId = (u as Record<string, unknown>).id as string;
    try {
      const r = await reconcileUser(supabase, userId, nowMs);
      const del = await propagateDeletionsForUser(supabase, userId);
      const entry: Record<string, unknown> = { userId, ...(r || {}) };
      if (del > 0) entry.deletedListings = del;
      if (r || del > 0) summary.push(entry);
    } catch (err) {
      console.error(`[replication-reconcile] ${userId}:`, err);
      void logSystemError({ source: 'cron/megaload-replication-reconcile', error: err }).catch(() => {});
      summary.push({ userId, error: err instanceof Error ? err.message : '처리 실패' });
    }
  }

  return NextResponse.json({
    success: true,
    usersProcessed: users.length,
    enqueued: summary,
    tookMs: Date.now() - started,
  });
}

/** 쿠팡 삭제 상품 → 타 채널 active 리스팅 삭제 전파 (사용자 단위, 멱등) */
async function propagateDeletionsForUser(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
): Promise<number> {
  const { data: deleted } = await supabase
    .from('sh_products')
    .select('id')
    .eq('megaload_user_id', userId)
    .eq('status', 'deleted')
    .order('updated_at', { ascending: false })
    .limit(50);

  const rows = (deleted || []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return 0;

  const adapterCache = new Map<Channel, BaseAdapter>();
  let total = 0;
  for (const p of rows) {
    const res = await propagateProductDeletion(supabase, {
      productId: p.id as string,
      megaloadUserId: userId,
      adapterCache,
    });
    total += res.succeeded;
  }
  return total;
}

async function reconcileUser(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
  nowMs: number,
): Promise<Record<string, unknown> | null> {
  // ── 1) 이미 대기/진행중 잡이 있으면 이번 사이클 스킵(파일업 방지) ──
  const { count: inflight } = await supabase
    .from('sh_replication_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('megaload_user_id', userId)
    .in('status', ['pending', 'running']);

  if ((inflight ?? 0) > 0) {
    return { skipped: 'job-inflight' };
  }

  // ── 2) 대상 채널 = 연결된 쿠팡外 지원 채널 ──
  const { data: creds } = await supabase
    .from('channel_credentials')
    .select('channel')
    .eq('megaload_user_id', userId)
    .eq('is_connected', true);

  const targetChannels = (creds || [])
    .map((c) => (c as Record<string, unknown>).channel as Channel)
    .filter((c) => c !== 'coupang' && isChannelSupported(c));

  if (targetChannels.length === 0) {
    return { skipped: 'no-target-channels' };
  }

  // ── 3) 채널별 마진 스냅샷 (sh_channel_margin_settings, is_enabled만) ──
  const { data: marginRows } = await supabase
    .from('sh_channel_margin_settings')
    .select('channel, margin_percent, is_enabled')
    .eq('megaload_user_id', userId);

  const margins: Record<string, number> = {};
  const disabled = new Set<string>();
  for (const m of (marginRows || []) as Array<Record<string, unknown>>) {
    const ch = m.channel as string;
    if (m.is_enabled === false) disabled.add(ch);
    margins[ch] = typeof m.margin_percent === 'number' ? (m.margin_percent as number) : Number(m.margin_percent) || 0;
  }
  // 마진설정에서 명시적으로 끈 채널은 제외 (없으면 기본 포함, 마진 0)
  const enabledTargets = targetChannels.filter((c) => !disabled.has(c));
  if (enabledTargets.length === 0) {
    return { skipped: 'all-targets-disabled' };
  }

  // ── 4) 쿠팡 active 상품 스캔(최신순, updated_at 포함=라이프사이클 변경감지용) ──
  const { data: products } = await supabase
    .from('sh_products')
    .select('id, updated_at')
    .eq('megaload_user_id', userId)
    .eq('status', 'active')
    .not('coupang_product_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(SCAN_LIMIT);

  const productList = (products || []) as Array<Record<string, unknown>>;
  const productIds = productList.map((p) => p.id as string);
  const productUpdatedAt = new Map<string, number>();
  for (const p of productList) {
    productUpdatedAt.set(p.id as string, p.updated_at ? new Date(p.updated_at as string).getTime() : 0);
  }
  if (productIds.length === 0) {
    return { skipped: 'no-coupang-products' };
  }

  // ── 5) 해당 상품들의 채널 커버리지 로드 (product_id → channel → row) ──
  const { data: channelRows } = await supabase
    .from('sh_product_channels')
    .select('product_id, channel, status, last_synced_at, updated_at')
    .in('product_id', productIds)
    .in('channel', enabledTargets);

  const rowsByProduct = new Map<string, Map<string, ChannelRow>>();
  for (const row of (channelRows || []) as ChannelRow[]) {
    const m = rowsByProduct.get(row.product_id) ?? new Map<string, ChannelRow>();
    m.set(row.channel, row);
    rowsByProduct.set(row.product_id, m);
  }

  // ── 6) 작업필요 상품 추출 (미등록 | 백오프경과 failed | active 인데 원본변경=stale) ──
  const candidateProducts: string[] = [];
  const gapChannels = new Set<string>();
  for (const pid of productIds) {
    const chRows = rowsByProduct.get(pid);
    const prodUpd = productUpdatedAt.get(pid) ?? 0;
    const gaps = enabledTargets.filter((c) => {
      const row = chRows?.get(c);
      if (!row) return true; // 미등록 → 등록
      if (row.status === 'failed') {
        const u = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        return nowMs - u >= FAILED_BACKOFF_MS; // 백오프 경과 → 재시도
      }
      if (row.status === 'active') {
        // 마지막 push 이후 원본이 바뀌었으면 stale → 재push(업데이트)
        const synced = row.last_synced_at ? new Date(row.last_synced_at).getTime() : 0;
        return synced < prodUpd;
      }
      return false; // pending/registering/needs_input/queued/mapping/deleted/suspended/stale → 스킵
    });
    if (gaps.length > 0) {
      candidateProducts.push(pid);
      for (const g of gaps) gapChannels.add(g);
    }
    if (candidateProducts.length >= MAX_PRODUCTS_PER_USER) break;
  }

  if (candidateProducts.length === 0) {
    return { skipped: 'fully-covered' };
  }

  // ── 7) enqueue (결손 채널의 합집합 × 결손 상품) ──
  const jobChannels = enabledTargets.filter((c) => gapChannels.has(c));
  const result = await enqueueReplicationJob(supabase, {
    megaloadUserId: userId,
    productIds: candidateProducts,
    targetChannels: jobChannels,
    margins,
  });

  return {
    enqueuedProducts: result.productCount,
    enqueuedChannels: result.channelCount,
    total: result.total,
    jobId: result.jobId,
    ...(result.skippedReason && { enqueueSkipped: result.skippedReason }),
  };
}
