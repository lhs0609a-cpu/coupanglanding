/**
 * 멀티채널 복제 현황 매트릭스 — Phase 6
 *
 * GET /api/megaload/products/channel-status?limit=100&offset=0
 *   → 상품 × 채널 상태 매트릭스 + 채널별 요약 카운트
 *      운영자가 "어느 상품이 어느 채널에 올라갔나"를 한눈에 보는 화면.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { isChannelSupported } from '@/lib/megaload/types';
import type { Channel } from '@/lib/megaload/types';

export const maxDuration = 30;

const SUMMARY_CAP = 10000;

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
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  // ── 대상 채널 = 연결된 쿠팡外 지원 채널 ──
  const { data: creds } = await serviceClient
    .from('channel_credentials')
    .select('channel')
    .eq('megaload_user_id', shUserId)
    .eq('is_connected', true);
  const targetChannels = (creds || [])
    .map((c) => (c as Record<string, unknown>).channel as Channel)
    .filter((c) => c !== 'coupang' && isChannelSupported(c));

  // ── 상품 페이지 (쿠팡 등록 상품) ──
  const { data: products, count } = await serviceClient
    .from('sh_products')
    .select('id, product_name', { count: 'exact' })
    .eq('megaload_user_id', shUserId)
    .eq('status', 'active')
    .not('coupang_product_id', 'is', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const productList = (products || []) as Array<Record<string, unknown>>;
  const productIds = productList.map((p) => p.id as string);

  // ── 이 상품들의 채널 행 ──
  const statusByProduct = new Map<string, Record<string, { status: string; url?: string; error?: string }>>();
  if (productIds.length > 0) {
    const { data: rows } = await serviceClient
      .from('sh_product_channels')
      .select('product_id, channel, status, channel_url, error_message')
      .in('product_id', productIds);
    for (const r of (rows || []) as Array<Record<string, unknown>>) {
      const pid = r.product_id as string;
      const m = statusByProduct.get(pid) ?? {};
      m[r.channel as string] = {
        status: r.status as string,
        url: (r.channel_url as string) || undefined,
        error: (r.error_message as string) || undefined,
      };
      statusByProduct.set(pid, m);
    }
  }

  const matrix = productList.map((p) => ({
    productId: p.id as string,
    productName: (p.product_name as string) || (p.id as string).slice(0, 8),
    channels: statusByProduct.get(p.id as string) || {},
  }));

  // ── 채널별 요약 카운트 (전체, 경량 컬럼만) ──
  const { data: allRows } = await serviceClient
    .from('sh_product_channels')
    .select('channel, status')
    .eq('megaload_user_id', shUserId)
    .neq('channel', 'coupang')
    .limit(SUMMARY_CAP);

  const summary: Record<string, Record<string, number>> = {};
  for (const r of (allRows || []) as Array<Record<string, unknown>>) {
    const ch = r.channel as string;
    const st = r.status as string;
    summary[ch] = summary[ch] || {};
    summary[ch][st] = (summary[ch][st] || 0) + 1;
  }

  return NextResponse.json({
    targetChannels,
    total: count ?? productList.length,
    limit,
    offset,
    matrix,
    summary,
  });
}
