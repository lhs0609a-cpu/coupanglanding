/**
 * 리스팅 등록 실행 — status='registering' 리스팅을 셀러 쿠팡 계정에 실제 등록.
 *   등록 후 channel_product_id(sellerProductId) + vendor_item_id 를 캡처 → 판매귀속 키.
 *
 * payload 는 검증된 coupang-product-builder(buildCoupangProductPayload)를 재사용한다.
 *   - 고시(filledNotices)·속성(attributeMeta/values)·아이템·인증·상세 로직 전부 재사용
 *   - 카테고리 메타는 셀러 어댑터로 캐시 우선 조회
 *
 * ⚠️ 라이브 검증 필요 항목: 택배사 코드(deliveryCompanyCode)·반품주소는 셀러/공급사 설정에
 *    따라 달라짐 — 실등록 첫 건에서 쿠팡 응답으로 확정.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdapter } from '../adapters/factory';
import type { CoupangAdapter } from '../adapters/coupang.adapter';
import {
  buildCoupangProductPayload,
  type DeliveryInfo, type ReturnInfo, type CertificationInfo, type OptionVariant, type AttributeMeta,
} from '../services/coupang-product-builder';
import type { LocalProduct } from '../services/local-product-reader';
import type { FilledNoticeCategory } from '../services/notice-field-filler';
import { getNoticeCategoryWithCache } from '../services/notice-category-cache';
import { getAttributesWithCache } from '../services/attribute-cache';

interface Ctx { sc: SupabaseClient }

export async function runRegistrationBatch(ctx: Ctx, limit = 10): Promise<{ processed: number; ok: number; failed: number }> {
  const { sc } = ctx;
  const { data: listings } = await sc
    .from('supplier_listings')
    .select('id, seller_megaload_user_id, catalog_product_id, retail_price, display_name, channel')
    .eq('status', 'registering')
    .eq('channel', 'coupang')
    .limit(limit);

  let ok = 0, failed = 0;
  for (const l of (listings || []) as unknown as Record<string, unknown>[]) {
    try {
      await registerOne(sc, l);
      ok++;
    } catch (e) {
      failed++;
      await sc.from('supplier_listings')
        .update({ status: 'failed', error_message: e instanceof Error ? e.message.slice(0, 400) : '등록 실패' })
        .eq('id', l.id as string);
    }
  }
  return { processed: (listings || []).length, ok, failed };
}

interface ProductRow {
  category_code: string | null; category_path: string | null;
  manufacturer: string | null; brand: string | null;
  thumbnail_url: string | null; image_urls: string[]; detail_html: string | null;
  notices: Record<string, string>; attributes: Record<string, string>; certifications: unknown[];
  options: { option_name: string; supply_price: number; stock: number; sku: string | null; barcode: string | null }[];
}
interface TplRow {
  outbound_place_code: string; return_center_code: string;
  delivery_charge_type: string | null; delivery_charge: number | null;
  free_ship_over_amount: number | null; return_charge: number | null;
  after_service_tel: string | null; after_service_guide: string | null;
}

async function registerOne(sc: SupabaseClient, listing: Record<string, unknown>) {
  const sellerId = String(listing.seller_megaload_user_id);
  const catalogProductId = String(listing.catalog_product_id);
  const retailPrice = Number(listing.retail_price) || 0;
  const displayName = String(listing.display_name || '');

  const { data: productRaw } = await sc
    .from('supplier_products')
    .select('*, options:supplier_product_options(*)')
    .eq('id', catalogProductId).single();
  if (!productRaw) throw new Error('상품을 찾을 수 없습니다.');
  const p = productRaw as unknown as ProductRow;
  const categoryCode = p.category_code || '';
  if (!categoryCode) throw new Error('카테고리 코드 없음');

  const { data: tplRaw } = await sc
    .from('sh_channel_shipping_templates')
    .select('*').eq('megaload_user_id', sellerId).eq('channel', 'coupang').maybeSingle();
  const tpl = tplRaw as TplRow | null;
  if (!tpl?.outbound_place_code || !tpl?.return_center_code) {
    throw new Error('셀러 쿠팡 출고지/반품지 코드 미설정 — 채널 배송설정 필요');
  }

  const adapter = await getAuthenticatedAdapter(sc, sellerId, 'coupang') as CoupangAdapter;

  // 카테고리 메타 (캐시 우선)
  const [noticeMeta, attrMeta] = await Promise.all([
    getNoticeCategoryWithCache(sc, adapter, categoryCode).catch(() => []),
    getAttributesWithCache(sc, adapter, categoryCode).catch(() => []),
  ]);

  // 공급사가 채운 고시값 → FilledNoticeCategory (없으면 "상세페이지 참조")
  const filledNotices: FilledNoticeCategory[] = noticeMeta.map((g) => ({
    noticeCategoryName: g.noticeCategoryName,
    noticeCategoryDetailName: (g.fields || []).map((f) => ({
      noticeCategoryDetailName: f.name,
      content: String((p.notices || {})[f.name] ?? '상세페이지 참조'),
    })),
  }));

  const optionVariants: OptionVariant[] = (p.options || []).map((o) => ({
    optionName: o.option_name || '기본',
    salePrice: retailPrice,
    stock: o.stock ?? 0,
    barcode: o.barcode || undefined,
    sku: o.sku || undefined,
  }));

  const deliveryInfo: DeliveryInfo = {
    deliveryCompanyCode: 'CJGLS',   // ⚠️ 라이브 검증: 공급사/셀러 택배사 코드
    deliveryChargeType: (tpl.delivery_charge_type as DeliveryInfo['deliveryChargeType']) || 'FREE',
    deliveryCharge: tpl.delivery_charge || 0,
    freeShipOverAmount: tpl.free_ship_over_amount || 0,
    deliveryChargeOnReturn: tpl.return_charge || 0,
    outboundShippingPlaceCode: tpl.outbound_place_code,
  };
  const returnInfo: ReturnInfo = {
    returnCenterCode: tpl.return_center_code,
    returnCharge: tpl.return_charge || 0,
    companyContactNumber: tpl.after_service_tel || '010-0000-0000',
    afterServiceContactNumber: tpl.after_service_tel || '010-0000-0000',
    afterServiceInformation: tpl.after_service_guide || '상세페이지 참조',
  };

  const localProduct: LocalProduct = {
    folderPath: '', productCode: catalogProductId.slice(0, 8),
    productJson: {
      name: displayName, brand: p.brand || undefined,
      barcode: p.options?.[0]?.barcode || undefined,
      certifications: p.certifications as { certificationType: string; certificationCode?: string }[],
      options: (p.options || []).map((o) => ({ optionName: o.option_name, salePrice: retailPrice, stock: o.stock, barcode: o.barcode || undefined, sku: o.sku || undefined })),
    },
    mainImages: [], detailImages: [], infoImages: [], reviewImages: [],
  };

  const payload = buildCoupangProductPayload({
    vendorId: adapter.getVendorId(),
    product: localProduct,
    sellingPrice: retailPrice,
    categoryCode,
    categoryPath: p.category_path || '',
    mainImageUrls: [p.thumbnail_url, ...(p.image_urls || [])].filter(Boolean) as string[],
    detailImageUrls: [],
    deliveryInfo, returnInfo,
    brand: p.brand || undefined,
    manufacturer: p.manufacturer || undefined,
    filledNotices,
    attributeMeta: attrMeta as unknown as AttributeMeta[],
    attributeValues: p.attributes || {},
    aiStoryHtml: p.detail_html || undefined,
    displayProductName: displayName,
    sellerProductName: displayName,
    certifications: p.certifications as CertificationInfo[],
    optionVariants,
    preventionSeed: sellerId,   // 아이템위너 방지 이미지 셔플 시드
  });

  const created = await adapter.createProduct(payload);
  const sellerProductId = created.channelProductId;
  if (!sellerProductId) throw new Error('sellerProductId 미반환');

  let vendorItemId: string | null = null;
  try {
    const detail = await adapter.getProductDetail(sellerProductId);
    vendorItemId = detail?.items?.[0]?.vendorItemId || null;
  } catch { /* 나중 재조회 */ }

  await sc.from('supplier_listings').update({
    channel_product_id: sellerProductId,
    vendor_item_id: vendorItemId,
    status: 'active',
    error_message: null,
    registered_at: new Date().toISOString(),
  }).eq('id', listing.id as string);
}
