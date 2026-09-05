/**
 * 대량등록 직후 "이번에 올린 상품들"의 채널별 전파 상태 실시간 조회.
 *
 * GET /api/megaload/products/replication-status?ids=<id1,id2,...>
 *   → 연결된 타채널별로 { active, needs_input, failed, pending, registering, ... } 카운트.
 *      대량등록 Step3 실시간 결과 패널이 몇 초 간격으로 폴링한다.
 *
 * 전파 자체는 백그라운드 러너가 처리하므로, 방금 enqueue 한 직후엔 아직 row 가 없을 수 있다
 * (그 경우 pending 으로 취급해 "전파 대기"로 표시).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { isChannelSupported } from '@/lib/megaload/types';
import type { Channel } from '@/lib/megaload/types';

export const maxDuration = 20;

const MAX_IDS = 500;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceClient();
  let shUserId: string;
  try {
    shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '메가로드 계정 필요' }, { status: 403 });
  }

  const url = new URL(request.url);
  const ids = (url.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  // 연결된 쿠팡外 지원 채널 = 전파 대상 후보
  const { data: creds } = await serviceClient
    .from('channel_credentials')
    .select('channel')
    .eq('megaload_user_id', shUserId)
    .eq('is_connected', true);
  const targetChannels = (creds || [])
    .map((c) => (c as Record<string, unknown>).channel as Channel)
    .filter((c) => c !== 'coupang' && isChannelSupported(c));

  const byChannel: Record<string, Record<string, number>> = {};
  for (const ch of targetChannels) byChannel[ch] = {};

  if (ids.length > 0 && targetChannels.length > 0) {
    const { data: rows } = await serviceClient
      .from('sh_product_channels')
      .select('channel, status')
      .eq('megaload_user_id', shUserId)
      .neq('channel', 'coupang')
      .in('product_id', ids);
    for (const r of (rows || []) as Array<Record<string, unknown>>) {
      const ch = r.channel as string;
      const st = (r.status as string) || 'unknown';
      if (!byChannel[ch]) byChannel[ch] = {};
      byChannel[ch][st] = (byChannel[ch][st] || 0) + 1;
    }
  }

  // 채널별로 "아직 row 없는" 상품 수 = 전파 대기(pending)로 환산
  const perChannel = targetChannels.map((ch) => {
    const counts = byChannel[ch] || {};
    const seen = Object.values(counts).reduce((a, b) => a + b, 0);
    const waiting = Math.max(0, ids.length - seen);
    const active = counts['active'] || 0;
    const needsInput = counts['needs_input'] || 0;
    const failed = counts['failed'] || 0;
    const inflight = (counts['pending'] || 0) + (counts['registering'] || 0) + (counts['mapping'] || 0) + (counts['queued'] || 0) + waiting;
    const done = active + needsInput + failed;
    return {
      channel: ch,
      total: ids.length,
      active,
      needsInput,
      failed,
      inflight,
      done,
      settled: done >= ids.length,
      raw: counts,
    };
  });

  const allSettled = ids.length === 0 || perChannel.every((c) => c.settled);

  return NextResponse.json({
    total: ids.length,
    targetChannels,
    perChannel,
    allSettled,
  });
}
