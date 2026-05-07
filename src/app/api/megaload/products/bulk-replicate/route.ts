/**
 * 쿠팡 상품 → 타 채널 일괄 복제 잡 생성
 *
 * POST /api/megaload/products/bulk-replicate
 * body: {
 *   productIds: string[],     // sh_products.id 배열
 *   channels: Channel[],      // 복제 대상 채널 (쿠팡 제외)
 *   margins?: Record<Channel, number>  // 채널별 마진율(%) - 저장되어 재사용됨
 * }
 *
 * - 즉시 sh_replication_jobs 에 pending 잡 생성 후 응답
 * - 실제 처리는 /api/cron/megaload-replication-runner 가 담당
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { Channel } from '@/lib/megaload/types';
import { isChannelSupported } from '@/lib/megaload/types';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';

export const maxDuration = 30;


const MAX_PRODUCTS_PER_JOB = 1000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const inputProductIds = Array.isArray(body.productIds) ? (body.productIds as string[]) : [];
    const coupangProductIds = Array.isArray(body.coupangProductIds) ? (body.coupangProductIds as string[]) : [];
    const channels = Array.isArray(body.channels) ? (body.channels as Channel[]) : [];
    const margins = (body.margins || {}) as Record<string, number>;

    // ── 입력 검증 ──
    if (inputProductIds.length === 0 && coupangProductIds.length === 0) {
      return NextResponse.json({ error: '복제할 상품을 선택해주세요.' }, { status: 400 });
    }
    if (channels.length === 0) {
      return NextResponse.json({ error: '대상 채널을 선택해주세요.' }, { status: 400 });
    }

    // 지원 채널만 허용 (토스/카카오 제외)
    const unsupported = channels.filter((c) => !isChannelSupported(c));
    if (unsupported.length > 0) {
      const names = unsupported.map((c) => CHANNEL_LABELS[c]).join(', ');
      return NextResponse.json(
        { error: `${names} 은(는) 준비 중인 채널입니다. 공식 API 공개 후 지원됩니다.` },
        { status: 400 }
      );
    }

    // 쿠팡은 소스이므로 대상에서 제외
    const targetChannels = channels.filter((c) => c !== 'coupang');
    if (targetChannels.length === 0) {
      return NextResponse.json(
        { error: '쿠팡 외 1개 이상의 대상 채널을 선택해주세요.' },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    // ── megaload_user 확보 ──
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // ── 상품 소유권 검증 (productIds 와 coupangProductIds 양쪽 모두 지원, 합집합) ──
    //   - 본인 소유 상품(megaload_user_id == shUserId)만 통과
    //   - 양쪽 동시 입력 시 합쳐서 dedup
    //   - 쿼리 에러는 명시적으로 분리 — RLS / 네트워크 실패를 "상품 없음" 으로 오인하면 사용자 혼란
    let products: Array<Record<string, unknown>> = [];
    if (inputProductIds.length > 0) {
      const { data, error } = await serviceClient
        .from('sh_products')
        .select('id, megaload_user_id, coupang_product_id')
        .in('id', inputProductIds)
        .eq('megaload_user_id', shUserId);
      if (error) {
        console.error('[bulk-replicate] sh_products by id 조회 실패:', error);
        return NextResponse.json({ error: `상품 조회 실패: ${error.message}` }, { status: 500 });
      }
      products = (data || []) as Array<Record<string, unknown>>;
    }
    if (coupangProductIds.length > 0) {
      const { data, error } = await serviceClient
        .from('sh_products')
        .select('id, megaload_user_id, coupang_product_id')
        .in('coupang_product_id', coupangProductIds)
        .eq('megaload_user_id', shUserId);
      if (error) {
        console.error('[bulk-replicate] sh_products by coupang_product_id 조회 실패:', error);
        return NextResponse.json({ error: `상품 조회 실패: ${error.message}` }, { status: 500 });
      }
      const seen = new Set(products.map((p) => p.id as string));
      for (const row of (data || []) as Array<Record<string, unknown>>) {
        if (!seen.has(row.id as string)) products.push(row);
      }
    }

    const validIds = products.map((p) => p.id as string);

    if (validIds.length === 0) {
      return NextResponse.json(
        { error: '유효한 상품이 없습니다. 쿠팡 등록 완료 후 DB 저장이 확인된 후 다시 시도해주세요.' },
        { status: 400 }
      );
    }

    // 입력 총량 검증 (양쪽 합산)
    const inputTotal = inputProductIds.length + coupangProductIds.length;
    if (inputTotal > MAX_PRODUCTS_PER_JOB) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_PRODUCTS_PER_JOB}개까지 복제할 수 있습니다.` },
        { status: 400 }
      );
    }

    // ── 채널 자격증명 검증 ──
    const { data: creds } = await serviceClient
      .from('channel_credentials')
      .select('channel')
      .eq('megaload_user_id', shUserId)
      .eq('is_connected', true);

    const connectedChannels = new Set((creds || []).map((c) => (c as Record<string, unknown>).channel as string));
    const missing = targetChannels.filter((c) => !connectedChannels.has(c));
    if (missing.length > 0) {
      const names = missing.map((c) => CHANNEL_LABELS[c]).join(', ');
      return NextResponse.json(
        {
          error: `채널 연동 필요: ${names}. 채널관리 페이지에서 API 키를 먼저 등록해주세요.`,
          missingChannels: missing,
        },
        { status: 400 }
      );
    }

    // ── 마진 설정 저장 (재사용) ──
    const marginRows = targetChannels.map((channel) => ({
      megaload_user_id: shUserId,
      channel,
      margin_percent: typeof margins[channel] === 'number' ? margins[channel] : 0,
      is_enabled: true,
    }));
    if (marginRows.length > 0) {
      await serviceClient
        .from('sh_channel_margin_settings')
        .upsert(marginRows, { onConflict: 'megaload_user_id,channel' });
    }

    // ── 잡 생성 ──
    const total = validIds.length * targetChannels.length;
    const marginSnapshot: Record<string, number> = {};
    for (const ch of targetChannels) marginSnapshot[ch] = typeof margins[ch] === 'number' ? margins[ch] : 0;

    const { data: job, error: jobErr } = await serviceClient
      .from('sh_replication_jobs')
      .insert({
        megaload_user_id: shUserId,
        source_channel: 'coupang',
        target_channels: targetChannels,
        product_ids: validIds,
        margin_settings: marginSnapshot,
        status: 'pending',
        total,
      })
      .select('id')
      .single();

    if (jobErr || !job) {
      return NextResponse.json(
        { error: `잡 생성 실패: ${jobErr?.message || '알 수 없는 오류'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: (job as Record<string, unknown>).id as string,
      total,
      productCount: validIds.length,
      channelCount: targetChannels.length,
    });
  } catch (err) {
    console.error('[bulk-replicate] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '복제 잡 생성 실패' },
      { status: 500 }
    );
  }
}
