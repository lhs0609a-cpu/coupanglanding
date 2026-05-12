import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { downloadFile } from '@/lib/megaload/integrations/google-drive';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface CatalogImage {
  id: string;
  name: string;
  mime_type: string;
  size: number | null;
  width: number | null;
  height: number | null;
  thumbnail_link: string | null;
  kind: 'main' | 'detail' | 'option';
}

interface CatalogProductRow {
  id: string;
  product_name: string;
  display_name: string | null;
  brand: string | null;
  manufacturer: string | null;
  coupang_category_code: string | null;
  suggested_price: number | null;
  cost_price: number | null;
  images: CatalogImage[];
  options: unknown[];
  notices: Record<string, unknown> | null;
  attributes: Record<string, unknown> | null;
  raw_metadata: Record<string, unknown> | null;
  status: string;
  is_visible: boolean;
}

function inferExt(name: string, mime: string): string {
  const m = name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/);
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * POST /api/megaload/catalog/[id]/register
 *
 * MVP: Drive 이미지 → Supabase Storage 복사 + 사용자 sh_products 드래프트 생성.
 * 실제 쿠팡 API push는 사용자가 /megaload/products 에서 기존 플로우로 완료
 * (deliveryInfo/returnInfo 사용자 설정값 필요해서 별도 단계).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: catalogProductId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  let shUserId: string;
  try {
    shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' },
      { status: 404 }
    );
  }

  // 1) 카탈로그 상품 로드 + 노출 검증
  const { data: catalog, error: catErr } = await serviceClient
    .from('catalog_products')
    .select('*')
    .eq('id', catalogProductId)
    .single();

  if (catErr || !catalog) {
    return NextResponse.json({ error: '상품을 찾을 수 없습니다.' }, { status: 404 });
  }

  const product = catalog as unknown as CatalogProductRow;
  if (product.status !== 'active' || !product.is_visible) {
    return NextResponse.json({ error: '현재 등록 가능한 상품이 아닙니다.' }, { status: 400 });
  }

  // 2) 중복 등록 방지
  const { data: existingReg } = await serviceClient
    .from('catalog_registrations')
    .select('id, sh_product_id, status')
    .eq('catalog_product_id', catalogProductId)
    .eq('megaload_user_id', shUserId)
    .eq('channel', 'coupang')
    .maybeSingle();

  if (existingReg && existingReg.status !== 'failed') {
    return NextResponse.json(
      {
        error: '이미 등록 중이거나 완료된 상품입니다.',
        sh_product_id: existingReg.sh_product_id,
      },
      { status: 409 }
    );
  }

  // 3) 등록 row 선등록 (registering)
  const regPayload = {
    catalog_product_id: catalogProductId,
    megaload_user_id: shUserId,
    channel: 'coupang' as const,
    status: 'registering' as const,
  };
  let regId: string;
  if (existingReg) {
    await serviceClient
      .from('catalog_registrations')
      .update({ status: 'registering', error_message: null })
      .eq('id', existingReg.id);
    regId = existingReg.id;
  } else {
    const { data: newReg, error: regErr } = await serviceClient
      .from('catalog_registrations')
      .insert(regPayload)
      .select('id')
      .single();
    if (regErr || !newReg) {
      return NextResponse.json(
        { error: `등록 row 생성 실패: ${regErr?.message}` },
        { status: 500 }
      );
    }
    regId = (newReg as { id: string }).id;
  }

  const failRegistration = async (msg: string) => {
    await serviceClient
      .from('catalog_registrations')
      .update({ status: 'failed', error_message: msg })
      .eq('id', regId);
  };

  try {
    // 4) Drive 이미지 → Supabase Storage 병렬 복사
    const images = (product.images || []).filter((i) => i.id);
    if (images.length === 0) {
      throw new Error('등록할 이미지가 없습니다.');
    }

    const uploadResults = await Promise.all(
      images.map(async (img, idx) => {
        const { buffer, mimeType } = await downloadFile(img.id);
        const ext = inferExt(img.name, mimeType);
        const storagePath = `megaload/${shUserId}/catalog/${catalogProductId}/${idx.toString().padStart(3, '0')}_${img.id}.${ext}`;

        const { error: uploadErr } = await serviceClient.storage
          .from('product-images')
          .upload(storagePath, buffer, {
            contentType: mimeType || 'image/jpeg',
            cacheControl: '31536000',
            upsert: true,
          });
        if (uploadErr) {
          throw new Error(`이미지 업로드 실패 (${img.name}): ${uploadErr.message}`);
        }

        const { data: pub } = serviceClient.storage
          .from('product-images')
          .getPublicUrl(storagePath);

        return {
          url: pub.publicUrl,
          kind: img.kind,
          width: img.width,
          height: img.height,
          name: img.name,
        };
      })
    );

    // 5) sh_products 드래프트 생성
    const { data: shProduct, error: spErr } = await serviceClient
      .from('sh_products')
      .insert({
        megaload_user_id: shUserId,
        product_name: product.product_name,
        display_name: product.display_name,
        brand: product.brand,
        manufacturer: product.manufacturer,
        status: 'active',
        raw_data: {
          source: 'catalog',
          catalog_product_id: catalogProductId,
          coupang_category_code: product.coupang_category_code,
          suggested_price: product.suggested_price,
          cost_price: product.cost_price,
          options: product.options,
          notices: product.notices,
          attributes: product.attributes,
        },
      })
      .select('id')
      .single();

    if (spErr || !shProduct) {
      throw new Error(`상품 생성 실패: ${spErr?.message}`);
    }
    const shProductId = (shProduct as { id: string }).id;

    // 6) sh_product_images 생성
    const imageRows = uploadResults.map((r, i) => ({
      product_id: shProductId,
      image_url: r.url,
      cdn_url: r.url,
      image_type:
        r.kind === 'main' ? 'main' : r.kind === 'option' ? 'option' : 'detail',
      sort_order: i,
      width: r.width,
      height: r.height,
    }));
    const { error: imgErr } = await serviceClient.from('sh_product_images').insert(imageRows);
    if (imgErr) {
      throw new Error(`이미지 메타 저장 실패: ${imgErr.message}`);
    }

    // 7) 기본 옵션 (제안가가 있으면 1개 옵션)
    if (product.suggested_price && product.suggested_price > 0) {
      await serviceClient.from('sh_product_options').insert({
        product_id: shProductId,
        option_name: '기본',
        sale_price: product.suggested_price,
        cost_price: product.cost_price ?? null,
      });
    }

    // 8) sh_product_channels 매핑 (쿠팡, not_registered)
    await serviceClient.from('sh_product_channels').insert({
      product_id: shProductId,
      channel: 'coupang',
      status: 'not_registered',
      channel_category_id: product.coupang_category_code,
    });

    // 9) 등록 row 갱신 — 'succeeded' 처리 시점은 실제 쿠팡 API push 완료 후.
    //    여기서는 staging 완료까지만 수행하므로 'pending' 으로 두고 sh_product_id 만 연결.
    await serviceClient
      .from('catalog_registrations')
      .update({
        status: 'pending',
        sh_product_id: shProductId,
        error_message: null,
      })
      .eq('id', regId);

    return NextResponse.json({
      ok: true,
      sh_product_id: shProductId,
      registration_id: regId,
      message: '내 상품으로 가져왔습니다. 상품관리에서 쿠팡 등록을 완료하세요.',
      next_url: `/megaload/products?highlight=${shProductId}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failRegistration(msg);
    return NextResponse.json({ error: msg, registration_id: regId }, { status: 500 });
  }
}
