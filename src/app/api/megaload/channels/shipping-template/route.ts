/**
 * 채널 배송/반품/AS 템플릿 — Phase 2
 *
 * GET  /api/megaload/channels/shipping-template
 *   → { templates: Row[] }   (채널별 1행)
 * POST /api/megaload/channels/shipping-template  { channel, ...fields }
 *   → 채널 템플릿 upsert + is_complete 재계산
 *
 * 이 값이 채워져야 네이버 등 requiresShipTemplate 채널의 needs_input 이 해소된다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { rowToTemplate, isTemplateComplete } from '@/lib/megaload/services/shipping-template';
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
    return { serviceClient, shUserId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '메가로드 계정이 필요합니다.', status: 403 as const };
  }
}

export async function GET() {
  const r = await resolveUser();
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const { data } = await r.serviceClient
    .from('sh_channel_shipping_templates')
    .select('*')
    .eq('megaload_user_id', r.shUserId);

  return NextResponse.json({ templates: data || [] });
}

const NUM_FIELDS = ['delivery_charge', 'free_ship_over_amount', 'return_charge', 'exchange_charge'] as const;
const STR_FIELDS = [
  'outbound_place_code', 'return_center_code', 'after_service_tel',
  'after_service_guide', 'origin_code', 'origin_content',
] as const;

export async function POST(request: NextRequest) {
  const r = await resolveUser();
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = await request.json().catch(() => ({}));
  const channel = body.channel as Channel;
  if (!channel || !isChannelSupported(channel)) {
    return NextResponse.json({ error: '유효한 지원 채널이 필요합니다.' }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    megaload_user_id: r.shUserId,
    channel,
    updated_at: new Date().toISOString(),
  };
  for (const f of STR_FIELDS) if (body[f] !== undefined) row[f] = body[f] === '' ? null : body[f];
  for (const f of NUM_FIELDS) if (body[f] !== undefined) row[f] = Number(body[f]) || 0;
  if (body.delivery_charge_type !== undefined) {
    const t = body.delivery_charge_type;
    if (['FREE', 'NOT_FREE', 'CONDITIONAL_FREE'].includes(t)) row.delivery_charge_type = t;
  }

  // is_complete 계산을 위해 병합 후 판정 (기존 행 + 이번 입력)
  const { data: existing } = await r.serviceClient
    .from('sh_channel_shipping_templates')
    .select('*')
    .eq('megaload_user_id', r.shUserId)
    .eq('channel', channel)
    .maybeSingle();

  const merged = { ...(existing as Record<string, unknown> | null), ...row };
  row.is_complete = isTemplateComplete(rowToTemplate(merged));

  const { error } = await r.serviceClient
    .from('sh_channel_shipping_templates')
    .upsert(row, { onConflict: 'megaload_user_id,channel' });

  if (error) {
    return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, is_complete: row.is_complete });
}
