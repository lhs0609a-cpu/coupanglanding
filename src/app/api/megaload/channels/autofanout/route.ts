/**
 * 멀티채널 자동전파 마스터 토글 — Phase 0
 *
 * GET  /api/megaload/channels/autofanout
 *   → { enabled, connectedTargets: Channel[] }
 * POST /api/megaload/channels/autofanout  { enabled: boolean }
 *   → 켜는 순간부터 reconcile 크론이 쿠팡 등록분을 전 채널로 자동 전파
 *
 * 채널별 on/off·마진은 sh_channel_margin_settings(P2 UI)에서 관리.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { isChannelSupported } from '@/lib/megaload/types';
import type { Channel } from '@/lib/megaload/types';

export const maxDuration = 30;

async function resolveUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const, status: 401 };
  const serviceClient = await createServiceClient();
  try {
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    return { supabase, serviceClient, shUserId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '메가로드 계정이 필요합니다.', status: 403 as const };
  }
}

export async function GET() {
  const r = await resolveUser();
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { serviceClient, shUserId } = r;

  const { data: userRow } = await serviceClient
    .from('megaload_users')
    .select('auto_replicate_enabled')
    .eq('id', shUserId)
    .single();

  const { data: creds } = await serviceClient
    .from('channel_credentials')
    .select('channel')
    .eq('megaload_user_id', shUserId)
    .eq('is_connected', true);

  const connectedTargets = (creds || [])
    .map((c) => (c as Record<string, unknown>).channel as Channel)
    .filter((c) => c !== 'coupang' && isChannelSupported(c));

  return NextResponse.json({
    enabled: Boolean((userRow as Record<string, unknown> | null)?.auto_replicate_enabled),
    connectedTargets,
  });
}

export async function POST(request: NextRequest) {
  const r = await resolveUser();
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { serviceClient, shUserId } = r;

  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled(boolean)가 필요합니다.' }, { status: 400 });
  }

  const { error } = await serviceClient
    .from('megaload_users')
    .update({ auto_replicate_enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq('id', shUserId);

  if (error) {
    return NextResponse.json({ error: `설정 저장 실패: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, enabled: body.enabled });
}
