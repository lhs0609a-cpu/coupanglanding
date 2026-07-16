/**
 * 복제 잡 enqueue (멱등 보조 헬퍼)
 *
 * reconcile 크론 / inline hook(쿠팡 등록 직후) / bulk-replicate 가 모두 이걸 공유한다.
 * 실제 처리는 megaload-replication-runner 크론이 담당(FIFO·멱등·placeholder).
 *
 *  - 쿠팡(source)은 항상 제외
 *  - 지원 채널만(toss/kakao 등 등록 API 없는 채널 제외)
 *  - 마진은 호출측이 sh_channel_margin_settings 스냅샷으로 전달
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Channel } from '../types';
import { isChannelSupported } from '../types';

export interface EnqueueResult {
  jobId: string | null;
  total: number;
  productCount: number;
  channelCount: number;
  /** 잡을 만들지 않은 사유 (빈 입력 / DB 오류 등) */
  skippedReason?: string;
}

/**
 * sh_replication_jobs 에 pending 잡 1건 생성.
 * productIds × targetChannels(쿠팡 제외) 카테시안을 러너가 처리하며,
 * 이미 active 인 (상품,채널) 쌍은 러너의 dedup 가드가 건너뛴다(과투입 안전).
 */
export async function enqueueReplicationJob(
  serviceClient: SupabaseClient,
  opts: {
    megaloadUserId: string;
    productIds: string[];
    targetChannels: Channel[];
    margins?: Record<string, number>;
  },
): Promise<EnqueueResult> {
  const productIds = [...new Set(opts.productIds)].filter(Boolean);
  const targetChannels = [...new Set(opts.targetChannels)].filter(
    (c) => c !== 'coupang' && isChannelSupported(c),
  );

  if (productIds.length === 0 || targetChannels.length === 0) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'empty' };
  }

  const marginSnapshot: Record<string, number> = {};
  for (const ch of targetChannels) {
    marginSnapshot[ch] = typeof opts.margins?.[ch] === 'number' ? (opts.margins[ch] as number) : 0;
  }

  const total = productIds.length * targetChannels.length;

  const { data, error } = await serviceClient
    .from('sh_replication_jobs')
    .insert({
      megaload_user_id: opts.megaloadUserId,
      source_channel: 'coupang',
      target_channels: targetChannels,
      product_ids: productIds,
      margin_settings: marginSnapshot,
      status: 'pending',
      total,
    })
    .select('id')
    .single();

  if (error || !data) {
    return {
      jobId: null,
      total: 0,
      productCount: 0,
      channelCount: 0,
      skippedReason: `db: ${error?.message ?? 'insert 실패'}`,
    };
  }

  return {
    jobId: (data as Record<string, unknown>).id as string,
    total,
    productCount: productIds.length,
    channelCount: targetChannels.length,
  };
}

/**
 * 자동전파 enqueue — auto_replicate_enabled 일 때만, 연결+활성 대상 채널·마진을 해소해 잡 생성.
 * 쿠팡 등록 완료 직후 inline hook 에서 호출(즉시성). reconcile 가 백스톱이라 실패해도 결국 수렴.
 */
export async function enqueueAutoReplication(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  productIds: string[],
): Promise<EnqueueResult> {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (ids.length === 0) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'empty' };
  }

  const { data: u } = await serviceClient
    .from('megaload_users')
    .select('auto_replicate_enabled')
    .eq('id', megaloadUserId)
    .single();
  if (!(u as Record<string, unknown> | null)?.auto_replicate_enabled) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'autofanout-off' };
  }

  const { data: creds } = await serviceClient
    .from('channel_credentials')
    .select('channel')
    .eq('megaload_user_id', megaloadUserId)
    .eq('is_connected', true);
  const targets = (creds || [])
    .map((c) => (c as Record<string, unknown>).channel as Channel)
    .filter((c) => c !== 'coupang' && isChannelSupported(c));
  if (targets.length === 0) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'no-target-channels' };
  }

  const { data: marginRows } = await serviceClient
    .from('sh_channel_margin_settings')
    .select('channel, margin_percent, is_enabled')
    .eq('megaload_user_id', megaloadUserId);
  const margins: Record<string, number> = {};
  const disabled = new Set<string>();
  for (const m of (marginRows || []) as Array<Record<string, unknown>>) {
    if (m.is_enabled === false) disabled.add(m.channel as string);
    margins[m.channel as string] = Number(m.margin_percent) || 0;
  }
  const enabled = targets.filter((c) => !disabled.has(c));
  if (enabled.length === 0) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'all-targets-disabled' };
  }

  return enqueueReplicationJob(serviceClient, {
    megaloadUserId,
    productIds: ids,
    targetChannels: enabled,
    margins,
  });
}

/**
 * 사용자가 대량등록 시 "이 채널들에 올려줘"라고 명시적으로 고른 채널로만 전파 enqueue.
 * enqueueAutoReplication 과 달리 auto_replicate_enabled / is_enabled 토글에 좌우되지 않는다
 * (사용자의 명시적 선택이 우선). 단, 연결(is_connected)된 채널로만 제한해 자격증명 없는
 * 채널에 잡을 만들지 않는다. 마진은 채널별 설정 스냅샷을 그대로 전달.
 */
export async function enqueueSelectedReplication(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  productIds: string[],
  selectedChannels: Channel[],
): Promise<EnqueueResult> {
  const ids = [...new Set(productIds)].filter(Boolean);
  const picked = [...new Set(selectedChannels)].filter(
    (c) => c !== 'coupang' && isChannelSupported(c),
  );
  if (ids.length === 0 || picked.length === 0) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'empty' };
  }

  const { data: creds } = await serviceClient
    .from('channel_credentials')
    .select('channel')
    .eq('megaload_user_id', megaloadUserId)
    .eq('is_connected', true);
  const connected = new Set(
    (creds || []).map((c) => (c as Record<string, unknown>).channel as string),
  );
  const targets = picked.filter((c) => connected.has(c));
  if (targets.length === 0) {
    return { jobId: null, total: 0, productCount: 0, channelCount: 0, skippedReason: 'no-connected-selected' };
  }

  const { data: marginRows } = await serviceClient
    .from('sh_channel_margin_settings')
    .select('channel, margin_percent')
    .eq('megaload_user_id', megaloadUserId);
  const margins: Record<string, number> = {};
  for (const m of (marginRows || []) as Array<Record<string, unknown>>) {
    margins[m.channel as string] = Number(m.margin_percent) || 0;
  }

  return enqueueReplicationJob(serviceClient, {
    megaloadUserId,
    productIds: ids,
    targetChannels: targets,
    margins,
  });
}
