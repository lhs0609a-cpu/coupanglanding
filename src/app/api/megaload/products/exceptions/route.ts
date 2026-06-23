/**
 * 멀티채널 예외큐 — Phase 2
 *
 * GET  /api/megaload/products/exceptions
 *   → needs_input 상태의 (상품,채널) 목록 + 누락필드별 그룹 요약
 *      운영자 유일 터치포인트: "어디서 왜 막혔나"
 * POST /api/megaload/products/exceptions
 *   { action: 'retry', field?, items? }   → 보류건을 failed 로 리셋 + 즉시 재투입
 *   { action: 'ack_cert', label }         → 인증 보유 확인 → 해당 카테 전건 재시도
 *
 * needs_input 행은 러너 dedup 가 스킵하므로, 재시도하려면 status 를 failed 로 되돌린 뒤
 * 복제 잡을 새로 투입(러너가 failed 는 재시도 허용)한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { enqueueReplicationJob } from '@/lib/megaload/services/replication-enqueue';
import type { Channel } from '@/lib/megaload/types';

export const maxDuration = 30;

interface ExceptionRow {
  product_id: string;
  channel: string;
  status: string;
  needs_input_fields: Array<{ field: string; reason: string }> | null;
  error_message: string | null;
  updated_at: string | null;
  sh_products?: { product_name?: string } | null;
}

async function resolveUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const, status: 401 };
  const serviceClient = await createServiceClient();
  try {
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    return { serviceClient, shUserId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '메가로드 계정이 필요합니다.', status: 403 as const };
  }
}

async function fetchNeedsInput(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  shUserId: string,
): Promise<ExceptionRow[]> {
  const { data } = await serviceClient
    .from('sh_product_channels')
    .select('product_id, channel, status, needs_input_fields, error_message, updated_at, sh_products(product_name)')
    .eq('megaload_user_id', shUserId)
    .eq('status', 'needs_input')
    .order('updated_at', { ascending: false })
    .limit(2000);
  return (data || []) as unknown as ExceptionRow[];
}

export async function GET() {
  const r = await resolveUser();
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const rows = await fetchNeedsInput(r.serviceClient, r.shUserId);

  // 누락필드별 그룹 요약
  const byField = new Map<string, { field: string; reason: string; count: number; channels: Set<string> }>();
  for (const row of rows) {
    for (const f of row.needs_input_fields || []) {
      const g = byField.get(f.field) || { field: f.field, reason: f.reason, count: 0, channels: new Set<string>() };
      g.count += 1;
      g.channels.add(row.channel);
      byField.set(f.field, g);
    }
  }
  const groups = [...byField.values()].map((g) => ({
    field: g.field,
    reason: g.reason,
    count: g.count,
    channels: [...g.channels],
  })).sort((a, b) => b.count - a.count);

  const items = rows.map((row) => ({
    productId: row.product_id,
    channel: row.channel,
    productName: row.sh_products?.product_name || row.product_id.slice(0, 8),
    fields: (row.needs_input_fields || []).map((f) => f.field),
    reason: row.error_message || (row.needs_input_fields || []).map((f) => f.reason).join('; '),
    updatedAt: row.updated_at,
  }));

  // 인증 가드로 막힌 건의 distinct 라벨 (reason 의 '라벨' 패턴에서 추출 — ack 버튼용)
  const certLabels = new Set<string>();
  for (const row of rows) {
    if (!(row.needs_input_fields || []).some((f) => f.field === 'cert_required')) continue;
    const m = (row.error_message || '').match(/'([^']+)'/);
    if (m) certLabels.add(m[1]);
  }

  return NextResponse.json({ total: rows.length, groups, items, certLabels: [...certLabels] });
}

/** 보류건을 failed 로 리셋 + 복제 잡 재투입 (즉시 재시도) */
async function retryTargets(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  shUserId: string,
  targets: Array<{ product_id: string; channel: string }>,
) {
  if (targets.length === 0) return { reset: 0, jobId: null as string | null };

  // 채널별 그룹화 후 status='needs_input' → 'failed' 리셋 (러너 dedup 가 failed 는 재시도 허용)
  const byChannel = new Map<string, string[]>();
  for (const t of targets) {
    const arr = byChannel.get(t.channel) || [];
    arr.push(t.product_id);
    byChannel.set(t.channel, arr);
  }

  let reset = 0;
  const allProductIds = new Set<string>();
  const channels = new Set<Channel>();
  for (const [channel, productIds] of byChannel) {
    await serviceClient
      .from('sh_product_channels')
      .update({
        status: 'failed',
        attempt_count: 0,
        next_retry_at: null,
        needs_input_fields: [],
        updated_at: new Date().toISOString(),
      })
      .eq('megaload_user_id', shUserId)
      .eq('channel', channel)
      .eq('status', 'needs_input')
      .in('product_id', productIds);
    reset += productIds.length;
    productIds.forEach((id) => allProductIds.add(id));
    channels.add(channel as Channel);
  }

  // 채널별 마진 스냅샷
  const { data: marginRows } = await serviceClient
    .from('sh_channel_margin_settings')
    .select('channel, margin_percent')
    .eq('megaload_user_id', shUserId);
  const margins: Record<string, number> = {};
  for (const m of (marginRows || []) as Array<Record<string, unknown>>) {
    margins[m.channel as string] = Number(m.margin_percent) || 0;
  }

  const job = await enqueueReplicationJob(serviceClient, {
    megaloadUserId: shUserId,
    productIds: [...allProductIds],
    targetChannels: [...channels],
    margins,
  });

  return { reset, jobId: job.jobId };
}

export async function POST(request: NextRequest) {
  const r = await resolveUser();
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'ack_cert') {
    const label = body.label as string;
    if (!label) return NextResponse.json({ error: 'label 이 필요합니다.' }, { status: 400 });

    // cert_acknowledged 에 라벨 추가
    const { data: userRow } = await r.serviceClient
      .from('megaload_users')
      .select('cert_acknowledged')
      .eq('id', r.shUserId)
      .single();
    const current = ((userRow as Record<string, unknown> | null)?.cert_acknowledged as string[]) || [];
    if (!current.includes(label)) {
      await r.serviceClient
        .from('megaload_users')
        .update({ cert_acknowledged: [...current, label], updated_at: new Date().toISOString() })
        .eq('id', r.shUserId);
    }

    // cert_required 로 막힌 전건 재시도
    const rows = await fetchNeedsInput(r.serviceClient, r.shUserId);
    const targets = rows
      .filter((row) => (row.needs_input_fields || []).some((f) => f.field === 'cert_required'))
      .map((row) => ({ product_id: row.product_id, channel: row.channel }));
    const result = await retryTargets(r.serviceClient, r.shUserId, targets);
    return NextResponse.json({ success: true, acknowledged: label, ...result });
  }

  if (action === 'retry') {
    let targets: Array<{ product_id: string; channel: string }> = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      targets = (body.items as Array<{ productId: string; channel: string }>)
        .map((i) => ({ product_id: i.productId, channel: i.channel }));
    } else {
      // field 기준(또는 전체) — 해당 누락필드를 가진 모든 보류건
      const rows = await fetchNeedsInput(r.serviceClient, r.shUserId);
      const field = body.field as string | undefined;
      targets = rows
        .filter((row) => !field || (row.needs_input_fields || []).some((f) => f.field === field))
        .map((row) => ({ product_id: row.product_id, channel: row.channel }));
    }
    const result = await retryTargets(r.serviceClient, r.shUserId, targets);
    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
}
