/**
 * Canonical Product — 채널 독립 마스터 모델
 *
 * 멀티채널 전파의 단일 진실. sh_products + options + images + raw_data 를
 * 채널 무관 형태로 정규화한다. 각 채널 어댑터의 mapFromCanonical 이 이걸 입력으로
 * 채널별 페이로드로 번역한다.
 *
 * ⚠️ 현재 등록 파이프라인이 영속화하지 않는 값(고시정보·필수속성·인증·배송템플릿)은
 *    canonical 에서 비어 있을 수 있다 → 매퍼가 needs_input 으로 드러낸다(P2/P3 보강).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Channel } from '../types';

// ────────────────────────────────────────────────
// Canonical 모델
// ────────────────────────────────────────────────

export interface CanonicalOption {
  optionId: string;
  sku: string | null;
  barcode: string | null;
  optionName: string;        // "블랙 / M" 또는 "기본"
  optionValue: string | null;
  salePrice: number;         // 절대 판매가 (채널 마진 적용 전)
  costPrice: number | null;
  weightGram: number | null;
  stock: number | null;
}

export interface CanonicalImage {
  url: string;
  role: 'main' | 'detail' | 'review' | 'info' | 'option';
  sortOrder: number;
}

export interface CanonicalProduct {
  productId: string;
  megaloadUserId: string;
  name: string;                  // 정식 상품명
  displayName: string | null;    // AI 노출명 (채널별 추가 변형 전)
  brand: string | null;
  manufacturer: string | null;
  internalCategoryId: string | null;   // sh_products.category_id (UUID)
  sourceCategoryCode: string | null;   // raw_data.categoryCode (쿠팡 카테고리 코드)
  detailHtml: string;            // 상세 본문 (머리/꼬리말 제외)
  images: CanonicalImage[];
  options: CanonicalOption[];
  attributes: Record<string, string>;  // 필수속성 (현재 미영속 → 보통 비어있음)
  notices: Record<string, string>;     // 상품정보고시 (현재 미영속 → 보통 비어있음)
  origin: string | null;
  sourceUrl: string | null;
  sourcePrice: number | null;
}

// ────────────────────────────────────────────────
// 채널 매핑 계약 (어댑터가 구현)
// ────────────────────────────────────────────────

export interface ChannelCapabilities {
  /** 이 채널에 자동 등록 가능한가 (false면 매퍼가 즉시 needs_input) */
  canCreate: boolean;
  /** 다옵션 단일상품 지원 */
  multiOption: boolean;
  /** 옵션 가격 표현: 절대가 / 대표가 대비 상대가 */
  optionPrice: 'absolute' | 'relative';
  /** 대표+추가 이미지 최대 장수 */
  maxImages: number;
  /** 상세/대표 이미지를 채널 자체 서버에 재호스팅해야 하는가 (네이버) */
  selfHostedImages: boolean;
  /** 상품정보고시 필수 */
  requiresNotice: boolean;
  /** 출고지·반품지·AS 등 셀러 배송 템플릿 필수 */
  requiresShipTemplate: boolean;
}

/** 셀러 배송/반품/AS 템플릿 (P2에서 sh_channel_shipping_templates 로 영속) */
export interface ChannelShippingTemplate {
  outboundPlaceCode?: string;
  returnCenterCode?: string;
  deliveryChargeType?: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE';
  deliveryCharge?: number;
  freeShipOverAmount?: number;
  returnCharge?: number;
  exchangeCharge?: number;
  afterServiceTel?: string;
  afterServiceGuide?: string;
  originCode?: string;       // 원산지 코드
  originContent?: string;
}

export interface ChannelMappingContext {
  channel: Channel;
  /** 매핑된 채널 카테고리 ID (러너/매퍼가 AI매핑+캐시로 해결) */
  channelCategoryId: string | null;
  /** 채널 적용 최종 대표 판매가 (마진 반영). 옵션별은 canonical.options 기준 + 마진율. */
  sellingPrice: number;
  /** 채널 마진율(%) — 옵션별 가격 보정용 */
  marginPercent: number;
  headerHtml?: string;
  footerHtml?: string;
  /** 셀러 배송/반품/AS 템플릿 (없으면 requiresShipTemplate 채널은 needs_input) */
  shippingTemplate?: ChannelShippingTemplate | null;
  /** 셀러 관리코드 prefix 등 */
  sellerManagementCode?: string;
  /** 원본 URL → 채널 호스팅 URL (selfHostedImages 채널의 재호스팅 결과; 러너가 사전 주입) */
  rehostedImages?: Map<string, string>;
}

export interface MissingField {
  field: string;
  reason: string;
}

export type ChannelMappingResult =
  | { ok: true; payload: Record<string, unknown>; warnings?: string[] }
  | { ok: false; status: 'needs_input' | 'blocked'; missing: MissingField[] };

export const DEFAULT_CAPABILITIES: ChannelCapabilities = {
  canCreate: false,
  multiOption: false,
  optionPrice: 'absolute',
  maxImages: 10,
  selfHostedImages: false,
  requiresNotice: false,
  requiresShipTemplate: false,
};

// ────────────────────────────────────────────────
// 빌더
// ────────────────────────────────────────────────

const IMAGE_ROLES: Record<string, CanonicalImage['role']> = {
  main: 'main', detail: 'detail', description: 'detail',
  review: 'review', info: 'info', option: 'option',
};

/**
 * DB 에서 CanonicalProduct 조립. 서비스 클라이언트로 호출(RLS bypass)할 때는
 * megaloadUserId 를 명시 전달해 cross-tenant 차단.
 */
export async function buildCanonical(
  supabase: SupabaseClient,
  productId: string,
  megaloadUserId?: string,
): Promise<CanonicalProduct | null> {
  let q = supabase
    .from('sh_products')
    .select('*, sh_product_options(*)')
    .eq('id', productId);
  if (megaloadUserId) q = q.eq('megaload_user_id', megaloadUserId);

  const { data: row } = await q.single();
  if (!row) return null;
  const product = row as Record<string, unknown>;
  const raw = (product.raw_data as Record<string, unknown>) || {};

  // 이미지: sh_product_images 우선, 없으면 raw_data 폴백
  const images: CanonicalImage[] = [];
  const { data: imgRows } = await supabase
    .from('sh_product_images')
    .select('image_url, cdn_url, image_type, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });

  if (imgRows && imgRows.length > 0) {
    for (const r of imgRows as Array<Record<string, unknown>>) {
      const url = (r.cdn_url as string) || (r.image_url as string);
      if (!url) continue;
      images.push({
        url,
        role: IMAGE_ROLES[(r.image_type as string) || 'main'] || 'detail',
        sortOrder: (r.sort_order as number) ?? 0,
      });
    }
  } else {
    // raw_data 폴백 (등록 시 저장된 URL 배열)
    const pushUrls = (urls: unknown, role: CanonicalImage['role']) => {
      if (Array.isArray(urls)) {
        urls.forEach((u, i) => { if (typeof u === 'string') images.push({ url: u, role, sortOrder: i }); });
      }
    };
    pushUrls(raw.mainImageUrls, 'main');
    pushUrls(raw.detailImageUrls, 'detail');
    pushUrls(raw.reviewImageUrls, 'review');
    pushUrls(raw.infoImageUrls, 'info');
  }

  // 옵션
  const optionRows = (product.sh_product_options as Array<Record<string, unknown>>) || [];
  const options: CanonicalOption[] = optionRows
    .filter((o) => o.is_active !== false)
    .map((o) => {
      const oraw = (o.raw_data as Record<string, unknown>) || {};
      return {
        optionId: o.id as string,
        sku: (o.sku as string) || null,
        barcode: (o.barcode as string) || null,
        optionName: (o.option_name as string) || '기본',
        optionValue: (o.option_value as string) || null,
        salePrice: Number(o.sale_price) || 0,
        costPrice: o.cost_price != null ? Number(o.cost_price) : null,
        weightGram: o.weight_gram != null ? Number(o.weight_gram) : null,
        stock: typeof oraw.stock === 'number' ? (oraw.stock as number) : null,
      };
    });

  return {
    productId,
    megaloadUserId: (product.megaload_user_id as string) || megaloadUserId || '',
    name: (product.product_name as string) || '',
    displayName: (product.display_name as string) || null,
    brand: (product.brand as string) || null,
    manufacturer: (product.manufacturer as string) || null,
    internalCategoryId: (product.category_id as string) || null,
    sourceCategoryCode: (raw.categoryCode as string) || null,
    detailHtml: (raw.aiStoryHtml as string) || (raw.content as string) || '',
    images,
    options,
    attributes: (raw.attributeValues as Record<string, string>) || {},
    notices: (raw.notices as Record<string, string>) || {},
    origin: (raw.origin as string) || null,
    sourceUrl: (product.source_url as string) || (raw.sourceUrl as string) || null,
    sourcePrice: raw.sourcePrice != null ? Number(raw.sourcePrice) : null,
  };
}

/**
 * canonical 의 핵심 식별값으로 안정적 해시 생성 (변경/drift 감지용 mapping_hash).
 * 가격·이미지·이름·옵션·상세 길이만 반영(타임스탬프 등 잡음 제외).
 */
export function canonicalHash(c: CanonicalProduct): string {
  const basis = JSON.stringify({
    n: c.name,
    b: c.brand,
    cat: c.internalCategoryId,
    img: c.images.map((i) => i.url),
    opt: c.options.map((o) => [o.sku, o.optionName, o.salePrice]),
    d: c.detailHtml.length,
  });
  // djb2 — 외부 의존성 없는 결정적 해시
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
