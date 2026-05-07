import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 30;


/**
 * POST /api/megaload/stock-monitor/backfill
 * 기존 등록 상품(source_url 있고 쿠팡 매핑 존재)을 sh_stock_monitors에 일괄 등록
 *
 * 대상:
 *  - sh_products.status != 'deleted'
 *  - sh_products.source_url IS NOT NULL (또는 raw_data.sourceUrl 존재)
 *  - sh_product_channels에 coupang 매핑 존재 (active/suspended)
 *  - sh_stock_monitors에 아직 등록 안 됨
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // 1. 사용자 상품 전체 조회 (source_url 또는 raw_data.sourceUrl 보유)
    const { data: allProducts, error: productsErr } = await serviceClient
      .from('sh_products')
      .select('id, source_url, coupang_product_id, raw_data')
      .eq('megaload_user_id', shUserId)
      .neq('status', 'deleted');

    if (productsErr) {
      return NextResponse.json({ error: productsErr.message }, { status: 500 });
    }

    type ProductRow = {
      id: string;
      source_url: string | null;
      coupang_product_id: string | null;
      raw_data: Record<string, unknown> | null;
    };
    const products = (allProducts || []) as unknown as ProductRow[];

    // 2. 이미 등록된 모니터 조회 (ID + source_url — 빈 URL 복구용)
    const { data: existingMonitors } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, product_id, source_url')
      .eq('megaload_user_id', shUserId);
    const existingMonitorMap = new Map<string, { id: string; source_url: string | null }>();
    for (const m of (existingMonitors || []) as unknown as { id: string; product_id: string; source_url: string | null }[]) {
      existingMonitorMap.set(m.product_id, { id: m.id, source_url: m.source_url });
    }
    const existingProductIds = new Set(existingMonitorMap.keys());

    // 3. 쿠팡 채널 매핑 조회
    const productIds = products.map(p => p.id);
    const { data: channels } = await serviceClient
      .from('sh_product_channels')
      .select('product_id, channel_product_id, status')
      .in('product_id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('channel', 'coupang');

    const channelMap = new Map<string, string>();
    for (const ch of (channels || []) as unknown as { product_id: string; channel_product_id: string | null; status: string }[]) {
      if (ch.channel_product_id && ch.status !== 'deleted' && ch.status !== 'failed') {
        channelMap.set(ch.product_id, ch.channel_product_id);
      }
    }

    // 4. 백필 대상 선별
    const toInsert: {
      megaload_user_id: string;
      product_id: string;
      coupang_product_id: string;
      source_url: string;
      source_status: string;
      coupang_status: string;
      is_active: boolean;
      registered_option_name: string | null;
    }[] = [];

    const urlUpdates: { id: string; source_url: string }[] = [];
    const monitorUrlRecoveries: { id: string; source_url: string }[] = [];
    let missingUrl = 0;
    let missingChannel = 0;
    let alreadyMonitored = 0;
    let recoveredUrls = 0;

    for (const p of products) {
      // source_url 우선순위: sh_products.source_url → raw_data.sourceUrl
      const rawSourceUrl = p.raw_data && typeof p.raw_data === 'object'
        ? (p.raw_data as Record<string, unknown>).sourceUrl
        : undefined;
      const sourceUrl = p.source_url || (typeof rawSourceUrl === 'string' ? rawSourceUrl : null);

      // raw_data.sourceUrl만 있고 column은 비었으면 채워줌
      if (!p.source_url && sourceUrl) {
        urlUpdates.push({ id: p.id, source_url: sourceUrl });
      }

      // 기존 모니터인 경우: source_url이 비어있고 sh_products에 URL이 있으면 복구
      if (existingProductIds.has(p.id)) {
        const existing = existingMonitorMap.get(p.id)!;
        const monitorUrlEmpty = !existing.source_url || existing.source_url.length === 0;
        if (monitorUrlEmpty && sourceUrl) {
          monitorUrlRecoveries.push({ id: existing.id, source_url: sourceUrl });
        }
        alreadyMonitored++;
        continue;
      }

      // 우선순위: sh_product_channels → sh_products.coupang_product_id (폴백)
      const coupangProductId = channelMap.get(p.id) || p.coupang_product_id || '';
      if (!coupangProductId) { missingChannel++; continue; }

      // source_url 없어도 등록 허용 — UI에서 나중에 추가 가능
      if (!sourceUrl) missingUrl++;

      const sourceName = p.raw_data && typeof p.raw_data === 'object'
        ? (p.raw_data as Record<string, unknown>).sourceName
        : undefined;
      const registeredOptionName = typeof sourceName === 'string' ? sourceName : null;

      toInsert.push({
        megaload_user_id: shUserId,
        product_id: p.id,
        coupang_product_id: coupangProductId,
        source_url: sourceUrl || '',
        source_status: 'unknown',
        coupang_status: 'active',
        is_active: true,
        registered_option_name: registeredOptionName,
      });
    }

    // 5. sh_products.source_url 보정 업데이트 (있는 경우)
    for (const u of urlUpdates) {
      await serviceClient.from('sh_products').update({ source_url: u.source_url }).eq('id', u.id);
    }

    // 5-1. 기존 모니터의 source_url 복구 — sync-coupang에 의해 덮어씌워진 URL 되살리기
    for (const r of monitorUrlRecoveries) {
      const { error: recoverErr } = await serviceClient
        .from('sh_stock_monitors')
        .update({
          source_url: r.source_url,
          last_checked_at: null, // 크론이 재체크 대상으로 잡도록
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id);
      if (!recoverErr) recoveredUrls++;
    }

    // 6. sh_stock_monitors 일괄 upsert (신규 등록)
    let created = 0;
    if (toInsert.length > 0) {
      const { error: insertErr, data: inserted } = await serviceClient
        .from('sh_stock_monitors')
        .upsert(toInsert, { onConflict: 'megaload_user_id,product_id' })
        .select('id');
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      created = (inserted || []).length;
    }

    // 상품이 0개이면 진단 정보 추가
    const hint = products.length === 0
      ? '쿠팡 상품이 아직 동기화되지 않았습니다. 상품관리에서 "쿠팡 동기화"를 먼저 실행해주세요.'
      : undefined;

    return NextResponse.json({
      created,
      alreadyMonitored,
      missingUrl,
      missingChannel,
      totalScanned: products.length,
      urlFilled: urlUpdates.length,
      recoveredUrls,
      hint,
    });

  } catch (err) {
    console.error('stock-monitor backfill error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
