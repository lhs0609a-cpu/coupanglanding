/**
 * POST /api/megaload/supplier-catalog/list
 *   { catalog_product_id, retail_price, channel?='coupang', preview?=false }
 *
 * preview=true  → 유니크 노출상품명만 생성해 반환(미저장, 모달 미리보기용)
 * preview=false → 판매가 검증(min~max) + 유니크 SEO 무충돌 예약 + supplier_listings 생성
 *                 (status='registering' — 로컬 에이전트/서버가 실제 쿠팡 등록을 이어받음)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { generateDisplayName } from '@/lib/megaload/services/display-name-generator';
import { notifySupplierProductListed } from '@/lib/utils/notifications';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceClient();
  let sellerId: string;
  try {
    sellerId = await ensureMegaloadUser(supabase, serviceClient, user.id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '메가로드 계정이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const catalogProductId = body.catalog_product_id as string;
  const channel = (body.channel as string) || 'coupang';
  const preview = body.preview === true;
  if (!catalogProductId) return NextResponse.json({ error: 'catalog_product_id가 필요합니다.' }, { status: 400 });

  const { data: product } = await serviceClient
    .from('supplier_products')
    .select('id, seller_product_name, display_product_name, brand, category_path, min_price, max_price, status, supplier_id')
    .eq('id', catalogProductId)
    .maybeSingle();
  if (!product || product.status !== 'approved') {
    return NextResponse.json({ error: '등록 가능한 승인 상품이 아닙니다.' }, { status: 400 });
  }

  const originalName = product.display_product_name || product.seller_product_name || '';
  const brand = product.brand || '';
  const categoryPath = product.category_path || '';

  // 유니크 SEO — productIndex 를 증분하며 supplier_listing_seo 에 무충돌 예약
  //   (같은 상품에 같은 이름 UNIQUE 제약 → insert 성공할 때까지 재생성)
  const genName = (idx: number) => generateDisplayName(originalName, brand, categoryPath, sellerId, idx);

  if (preview) {
    return NextResponse.json({ ok: true, display_name: genName(0) });
  }

  // 판매가 범위 검증
  const retailPrice = Number(body.retail_price) || 0;
  if (retailPrice < product.min_price || retailPrice > product.max_price) {
    return NextResponse.json({
      error: `판매가는 ₩${product.min_price.toLocaleString()}~${product.max_price.toLocaleString()} 범위여야 합니다.`,
    }, { status: 400 });
  }

  // 무충돌 이름 예약 (최대 25회 시도)
  let displayName = '';
  for (let idx = 0; idx < 25; idx++) {
    const candidate = genName(idx);
    const { error: seoErr } = await serviceClient
      .from('supplier_listing_seo')
      .insert({ catalog_product_id: catalogProductId, seller_megaload_user_id: sellerId, generated_name: candidate });
    if (!seoErr) { displayName = candidate; break; }
    // UNIQUE 위반(23505)이면 다음 index 로 재시도, 그 외 에러는 중단
    if (seoErr.code !== '23505') {
      return NextResponse.json({ error: `SEO 예약 실패: ${seoErr.message}` }, { status: 500 });
    }
  }
  if (!displayName) {
    return NextResponse.json({ error: '유니크 상품명 생성 실패 — 잠시 후 다시 시도해주세요.' }, { status: 409 });
  }

  // 재등록(upsert 갱신)인지 신규인지 판별 — 공급사 알림은 신규 등록에만 1회 발송
  const { data: prevListing } = await serviceClient
    .from('supplier_listings')
    .select('id')
    .eq('seller_megaload_user_id', sellerId)
    .eq('catalog_product_id', catalogProductId)
    .eq('channel', channel)
    .maybeSingle();

  // 리스팅 생성 (실제 쿠팡 등록은 로컬 에이전트/서버가 이어받음)
  const { data: listing, error: lErr } = await serviceClient
    .from('supplier_listings')
    .upsert({
      catalog_product_id: catalogProductId,
      seller_megaload_user_id: sellerId,
      channel,
      retail_price: retailPrice,
      display_name: displayName,
      sku_tag: catalogProductId,            // externalVendorSku 에 심어 판매 귀속
      status: 'registering',
    }, { onConflict: 'seller_megaload_user_id,catalog_product_id,channel' })
    .select('*')
    .single();

  if (lErr) return NextResponse.json({ error: `리스팅 생성 실패: ${lErr.message}` }, { status: 500 });

  // 신규 등록이면 공급사에게 "셀러가 내 상품을 올렸어요" 알림 (실패해도 등록엔 영향 없음)
  if (!prevListing && product.supplier_id) {
    try {
      const [{ data: sup }, { data: sellerRow }] = await Promise.all([
        serviceClient.from('suppliers').select('owner_profile_id').eq('id', product.supplier_id).maybeSingle(),
        serviceClient.from('megaload_users').select('seller_brand').eq('id', sellerId).maybeSingle(),
      ]);
      if (sup?.owner_profile_id) {
        await notifySupplierProductListed(
          serviceClient,
          sup.owner_profile_id,
          sellerRow?.seller_brand || '한',
          product.seller_product_name || product.display_product_name || '상품',
        );
      }
    } catch { /* 알림 실패 무시 */ }
  }

  return NextResponse.json({ ok: true, listing, display_name: displayName });
}
