import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

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

    // 2. 이미 등록된 모니터 product_id 세트
    const { data: existingMonitors } = await serviceClient
      .from('sh_stock_monitors')
      .select('product_id')
      .eq('megaload_user_id', shUserId);
    const existingProductIds = new Set(
      ((existingMonitors || []) as unknown as { product_id: string }[]).map(m => m.product_id)
    );

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
    let missingUrl = 0;
    let missingChannel = 0;
    let alreadyMonitored = 0;

    for (const p of products) {
      if (existingProductIds.has(p.id)) { alreadyMonitored++; continue; }

      // source_url 우선순위: sh_products.source_url → raw_data.sourceUrl
      const rawSourceUrl = p.raw_data && typeof p.raw_data === 'object'
        ? (p.raw_data as Record<string, unknown>).sourceUrl
        : undefined;
      const sourceUrl = p.source_url || (typeof rawSourceUrl === 'string' ? rawSourceUrl : null);

      // raw_data.sourceUrl만 있고 column은 비었으면 채워줌
      if (!p.source_url && sourceUrl) {
        urlUpdates.push({ id: p.id, source_url: sourceUrl });
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
        source_status: sourceUrl ? 'in_stock' : 'unknown',
        coupang_status: 'active',
        is_active: true,
        registered_option_name: registeredOptionName,
      });
    }

    // 5. sh_products.source_url 보정 업데이트 (있는 경우)
    for (const u of urlUpdates) {
      await serviceClient.from('sh_products').update({ source_url: u.source_url }).eq('id', u.id);
    }

    // 6. sh_stock_monitors 일괄 upsert
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

    return NextResponse.json({
      created,
      alreadyMonitored,
      missingUrl,
      missingChannel,
      totalScanned: products.length,
      urlFilled: urlUpdates.length,
    });

  } catch (err) {
    console.error('stock-monitor backfill error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
