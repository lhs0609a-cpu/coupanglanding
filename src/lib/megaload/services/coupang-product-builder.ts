// ============================================================
// 쿠팡 상품 등록 페이로드 빌더
// 쿠팡 OpenAPI v2 상품 등록 스펙에 맞춰 빌드
//
// 개선사항:
// - buyOptions ↔ attributes 분리 (구매옵션은 item-level, 속성은 attributes)
// - 멀티옵션 상품 지원 (색상×사이즈 조합 → 여러 item)
// - KC인증 지원 (certificationListByItem)
// - 할인가 표시 (originalPrice ≠ salePrice)
// - 바코드 지원
// - deliveryMethod 오타 수정
// ============================================================

import type { LocalProduct } from './local-product-reader';
import type { FilledNoticeCategory } from './notice-field-filler';
import type { ImageVariation } from './image-variation';
import { buildRichDetailPageHtml } from './detail-page-builder';
import { shuffleWithSeed, selectWithSeed } from './item-winner-prevention';

// ---- 입력 타입 ----

export interface DeliveryInfo {
  deliveryCompanyCode: string;
  deliveryChargeType: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE';
  deliveryCharge: number;
  freeShipOverAmount: number;
  deliveryChargeOnReturn: number;
  outboundShippingPlaceCode: string;
}

export interface ReturnInfo {
  returnCenterCode: string;
  returnCharge: number;
  companyContactNumber: string;
  afterServiceContactNumber: string;
  afterServiceInformation: string;
  // 쿠팡 필수 필드
  returnChargeName?: string;
  returnZipCode?: string;
  returnAddress?: string;
  returnAddressDetail?: string;
  vendorUserId?: string;
}

export interface AttributeMeta {
  attributeTypeName: string;
  required: boolean;
  dataType: string;
  attributeValues?: { attributeValueName: string }[];
}

/** 추출된 구매옵션 (item-level 반영용, attributes와 별도) */
export interface ExtractedBuyOption {
  name: string;
  value: string;
  unit?: string;
}

/** option-extractor에서 계산된 총 수량 (perCount × count) */
// totalUnitCount는 BuildCoupangPayloadParams에서 직접 받음

/** KC인증 정보 */
export interface CertificationInfo {
  certificationType: string;     // 'KC_CERTIFICATION' | 'OVERSEAS_CERTIFICATION' | etc.
  certificationCode?: string;    // 인증번호 (예: SU05016-21001)
  certificationOrganization?: string; // 인증기관
}

/** 멀티옵션 변형 (색상×사이즈 등 조합별 item) */
export interface OptionVariant {
  optionName: string;      // 옵션 표시명 (예: "블랙 / M")
  salePrice: number;
  originalPrice?: number;
  stock?: number;
  barcode?: string;
  sku?: string;            // 개별 SKU (없으면 자동 생성)
  mainImageUrls?: string[];  // 옵션별 대표이미지 (없으면 공통 사용)
}

export interface BuildCoupangPayloadParams {
  vendorId: string;
  product: LocalProduct;
  sellingPrice: number;
  categoryCode: string;
  mainImageUrls: string[];
  detailImageUrls: string[];
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
  brand?: string;
  manufacturer?: string;
  maximumBuyForPerson?: number;
  outboundShippingTimeDay?: number;
  // 가격
  originalPrice?: number;          // 정가 (할인 태그용, 미설정 시 sellingPrice 사용)
  // 동적 notices / attributes / 리치 상세페이지
  filledNotices?: FilledNoticeCategory[];
  attributeMeta?: AttributeMeta[];
  attributeValues?: Record<string, string>;
  reviewImageUrls?: string[];
  infoImageUrls?: string[];
  aiStoryHtml?: string;
  aiStoryParagraphs?: string[];
  aiReviewTexts?: string[];
  consignmentImageUrls?: string[];
  // 구매옵션 (option-extractor 추출값 — item-level 반영용)
  extractedBuyOptions?: ExtractedBuyOption[];
  // 총 수량 (option-extractor의 totalUnitCount — perCount × count)
  totalUnitCount?: number;
  // AI 생성 상품명
  displayProductName?: string;
  sellerProductName?: string;
  // 이미지 변형 (로깅용, 페이로드에 포함하지 않음)
  imageVariation?: ImageVariation;
  // KC인증
  certifications?: CertificationInfo[];
  // 멀티옵션 (제공 시 sellerProductItemList에 여러 item 생성)
  optionVariants?: OptionVariant[];
  // 바코드 (단일 옵션일 때)
  barcode?: string;
  // 세금/성인/해외 설정
  taxType?: 'TAX' | 'FREE' | 'ZERO';
  adultOnly?: 'EVERYONE' | 'ADULT_ONLY';
  parallelImported?: 'NOT_PARALLEL_IMPORTED' | 'PARALLEL_IMPORTED';
  overseasPurchased?: 'NOT_OVERSEAS_PURCHASED' | 'OVERSEAS_PURCHASED';
  pccNeeded?: boolean;
  // 아이템위너 방지
  preventionSeed?: string;            // 셀러ID 등 — 이미지 셔플 시드
  detailLayoutVariant?: string;       // 상세페이지 레이아웃 변형 (A/B/C/D)
  // 카테고리 경로 (예: "뷰티>스킨>크림>넥크림") — generalProductName, 고시정보 폴백에 사용
  categoryPath?: string;
}

// ---- HTML 이스케이프 (XSS 방어) ----

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * AI 생성 HTML에서 위험한 태그/속성을 제거
 * <script>, <iframe>, <object>, <embed> 태그 제거
 * on* 이벤트 핸들러 제거
 * javascript: URL 제거
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[\s\S]*?\/?>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?\/?>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"')
    .replace(/src\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'src=""');
}

// ---- 쿠팡 상품명 금지어/특수문자 패턴 ----

const FORBIDDEN_NAME_PATTERNS = [
  /[★☆♥♡▶▷◀◁●○■□◆◇△▽♠♣♦♬♪♩⊙◎]/g,
  /[!@#$%^&*=+|\\{}[\]<>~`]/g,
  /최저가|무료배송|할인|특가|한정|베스트|1위|인기|추천/g,
  /\b(SALE|HOT|BEST|NEW|EVENT|FREE)\b/gi,
];

function cleanProductName(name: string): string {
  let cleaned = name.trim();
  for (const pattern of FORBIDDEN_NAME_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // 금지어/특수문자 제거 후 빈 문자열이면 원본으로 폴백
  if (!cleaned) {
    cleaned = name.trim().replace(/\s+/g, ' ');
    if (!cleaned) cleaned = '상품';
  }
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100);
  }
  return cleaned;
}

// ---- 빌드 함수 ----

export function buildCoupangProductPayload(
  params: BuildCoupangPayloadParams,
): Record<string, unknown> {
  const {
    vendorId,
    product,
    sellingPrice,
    categoryCode,
    mainImageUrls,
    detailImageUrls,
    deliveryInfo,
    returnInfo,
    stock = 999,
    brand,
    manufacturer,
    maximumBuyForPerson = 0,
    outboundShippingTimeDay = 2,
    originalPrice,
    filledNotices,
    attributeMeta,
    attributeValues,
    reviewImageUrls,
    infoImageUrls,
    aiStoryHtml,
    aiStoryParagraphs,
    aiReviewTexts,
    consignmentImageUrls,
    extractedBuyOptions,
    displayProductName,
    sellerProductName,
    certifications,
    optionVariants,
    barcode,
    taxType = 'TAX',
    adultOnly = 'EVERYONE',
    parallelImported = 'NOT_PARALLEL_IMPORTED',
    overseasPurchased = 'NOT_OVERSEAS_PURCHASED',
    pccNeeded = false,
    preventionSeed,
    detailLayoutVariant,
    categoryPath,
  } = params;

  // ---- 1. 상품명 정리 ----
  const rawName = product.productJson.name || product.productJson.title || `상품_${product.productCode}`;
  const productName = displayProductName
    ? cleanProductName(displayProductName)
    : cleanProductName(rawName);
  const resolvedSellerName = sellerProductName
    ? cleanProductName(sellerProductName)
    : productName;

  // brand: 빈 문자열이면 안전한 기본값 (일부 카테고리에서 필수)
  const rawBrand = brand || product.productJson.brand || '';
  const resolvedBrand = rawBrand || '자체브랜드';
  // manufacturer: brand와 별개 — product.json에 manufacturer 있으면 사용
  const resolvedManufacturer = manufacturer
    || (product.productJson as Record<string, unknown>).manufacturer as string
    || rawBrand
    || '자체제조';

  // ---- 2. 대표이미지 (REPRESENTATION) ----
  // 빈 문자열/falsy 값만 제거 (preflight-placeholder URL은 프리플라이트에서 유효)
  const validMainImageUrls = mainImageUrls.filter(Boolean);
  // 아이템위너 방지: preventionSeed가 있으면 전체 이미지 순서를 셔플
  const orderedImageUrls = preventionSeed
    ? shuffleWithSeed(validMainImageUrls.slice(0, 10), preventionSeed)
    : validMainImageUrls.slice(0, 10);
  const images = orderedImageUrls.map((url, i) => ({
    imageOrder: i,
    imageType: 'REPRESENTATION',
    cdnPath: url,
    vendorPath: url,
  }));

  // ---- 3. 상세페이지 (contents) ----
  const hasRichContent = aiStoryHtml || aiStoryParagraphs?.length
    || (reviewImageUrls && reviewImageUrls.length > 0)
    || (infoImageUrls && infoImageUrls.length > 0);
  let detailHtml: string;

  if (hasRichContent) {
    detailHtml = sanitizeHtml(buildRichDetailPageHtml({
      productName,
      brand: resolvedBrand,
      aiStoryParagraphs,
      aiStoryHtml,
      reviewImageUrls,
      reviewTexts: aiReviewTexts,
      detailImageUrls,
      infoImageUrls,
      consignmentImageUrls,
    }, detailLayoutVariant));
  } else {
    detailHtml = buildSimpleDetailHtml(detailImageUrls, productName);
  }

  const contents = detailHtml
    ? [{
        contentsType: 'TEXT',
        contentDetails: [{ content: detailHtml, detailType: 'TEXT' }],
      }]
    : [];

  // ---- 4. 상품정보제공고시 (notices) ----
  // 완전 비활성화 — 쿠팡이 카테고리에 맞는 기본 고시정보 자동 적용
  // notices를 보내면 "N subschemas matched" 에러 발생 위험
  // TODO: 카테고리 메타 API에서 정확한 noticeCategoryName 매핑 완성 후 재활성화
  const noticeCategories: FilledNoticeCategory[] = [];

  // ---- 5. attributes (카테고리 필수 속성 + 구매옵션) ----
  // 쿠팡 API: attributes에 필수 속성 + 구매옵션(exposed) 모두 포함
  const metaAttributes = buildAttributes(attributeMeta, attributeValues);
  // extractedBuyOptions를 attributes에 병합 (구매옵션도 attributes로 전달)
  const buyOptionAttributes: { attributeTypeName: string; attributeValueName: string }[] = [];
  if (extractedBuyOptions) {
    for (const opt of extractedBuyOptions) {
      const alreadyExists = metaAttributes.some(a => a.attributeTypeName === opt.name);
      if (!alreadyExists && opt.value) {
        buyOptionAttributes.push({
          attributeTypeName: opt.name,
          attributeValueName: opt.unit ? `${opt.value}${opt.unit}` : opt.value,
        });
      }
    }
  }
  const attributes = [...metaAttributes, ...buyOptionAttributes];

  // ---- 6. KC인증 ----
  const certificationList = certifications && certifications.length > 0
    ? certifications.map((cert) => ({
        certificationType: cert.certificationType,
        certificationCode: cert.certificationCode || '',
        ...(cert.certificationOrganization
          ? { certificationOrganization: cert.certificationOrganization }
          : {}),
      }))
    : [];

  // ---- 7. unitCount (총 수량: perCount × count) ----
  // 쿠팡의 unitCount는 "묶음 내 총 수량"
  // 예: "80매 x 10팩" → 800, "3개세트" → 3
  let unitCount = 1;
  if (params.totalUnitCount && params.totalUnitCount > 0) {
    // option-extractor에서 정확히 계산된 값 우선 사용
    unitCount = params.totalUnitCount;
  } else if (extractedBuyOptions) {
    const countOpt = extractedBuyOptions.find(
      (o) => o.name === '수량' || o.name.includes('수량'),
    );
    if (countOpt) {
      const parsed = parseInt(countOpt.value, 10);
      if (!isNaN(parsed) && parsed > 0) unitCount = parsed;
    }
  }

  // ---- 8. itemName에 구매옵션 반영 ----
  let baseItemName = productName;
  if (extractedBuyOptions && extractedBuyOptions.length > 0) {
    const optParts: string[] = [];
    for (const opt of extractedBuyOptions) {
      if (opt.name === '수량') continue;
      if (opt.unit) {
        optParts.push(`${opt.value}${opt.unit}`);
      } else if (opt.name.includes('색상') || opt.name.includes('사이즈')) {
        optParts.push(opt.value);
      }
    }
    if (optParts.length > 0) {
      const optStr = optParts.join(', ');
      baseItemName = `${productName} (${optStr})`;
      if (baseItemName.length > 100) baseItemName = baseItemName.slice(0, 100);
    }
  }

  // ---- 9. 바코드 처리 ----
  const resolvedBarcode = barcode || (product.productJson as Record<string, unknown>).barcode as string || '';
  const hasBarcode = !!resolvedBarcode;

  // ---- 10. 할인가 (originalPrice > salePrice면 할인 태그 표시) ----
  if (originalPrice && originalPrice > 0 && originalPrice < sellingPrice) {
    console.warn(`[payload-builder] originalPrice(${originalPrice}) < sellingPrice(${sellingPrice}): 쿠팡에서 할인 태그가 표시되지 않습니다. originalPrice를 sellingPrice로 대체합니다.`);
  }
  const resolvedOriginalPrice = originalPrice && originalPrice > sellingPrice
    ? originalPrice
    : sellingPrice;

  // ---- 11. sellerProductItemList 조립 ----
  let sellerProductItemList: Record<string, unknown>[];

  if (optionVariants && optionVariants.length > 0) {
    // 멀티옵션 상품: 각 변형별 별도 item
    sellerProductItemList = optionVariants.map((variant, idx) => {
      const variantBarcode = variant.barcode || '';
      const variantImages = variant.mainImageUrls
        ? variant.mainImageUrls.slice(0, 10).map((url, i) => ({
            imageOrder: i,
            imageType: 'REPRESENTATION',
            cdnPath: url,
            vendorPath: url,
          }))
        : images;

      return {
        itemName: variant.optionName.slice(0, 100),
        originalPrice: variant.originalPrice ?? variant.salePrice,
        salePrice: variant.salePrice,
        maximumBuyCount: variant.stock ?? stock,
        maximumBuyForPerson,
        maximumBuyForPersonPeriod: 1,
        outboundShippingTimeDay,
        unitCount,
        adultOnly,
        taxType,
        parallelImported,
        overseasPurchased,
        pccNeeded,
        externalVendorSku: variant.sku || `${product.productCode}_${idx + 1}`,
        barcode: variantBarcode,
        emptyBarcode: !variantBarcode,
        certifications: certificationList.length > 0
          ? certificationList
          : [{ certificationType: 'NOT_REQUIRED', certificationCode: '' }],
        images: variantImages,
        // notices 생략 — requested:false(임시저장)이면 불필요
        attributes,
        contents,
      };
    });
  } else {
    // 단일 옵션 상품
    sellerProductItemList = [{
      itemName: baseItemName,
      originalPrice: resolvedOriginalPrice,
      salePrice: sellingPrice,
      maximumBuyCount: stock,
      maximumBuyForPerson,
      maximumBuyForPersonPeriod: 1,
      outboundShippingTimeDay,
      unitCount,
      adultOnly,
      taxType,
      parallelImported,
      overseasPurchased,
      pccNeeded: String(pccNeeded),  // 쿠팡: 문자열 "true"/"false"
      externalVendorSku: product.productCode,
      barcode: resolvedBarcode,
      emptyBarcode: !hasBarcode,
      ...((!hasBarcode) ? { emptyBarcodeReason: '상품확인불가_바코드없음사유' } : {}),
      certifications: certificationList.length > 0
        ? certificationList
        : [{ certificationType: 'NOT_REQUIRED', certificationCode: '' }],
      images,
      notices: [],
      attributes,
      contents,
    }];
  }

  // ---- 12. 전체 페이로드 조립 ----
  // 쿠팡 OpenAPI v2 seller-products 공식 스펙에 맞춤
  const payload: Record<string, unknown> = {
    displayCategoryCode: Number(categoryCode) || 0,
    sellerProductName: resolvedSellerName,
    vendorId,
    saleStartedAt: formatCoupangDateTime(new Date()),
    saleEndedAt: '2099-01-01T23:59:59',
    displayProductName: productName,
    brand: resolvedBrand,
    generalProductName: extractGeneralProductName(categoryPath, productName),
    productGroup: '',
    deliveryMethod: 'SEQUENCIAL',
    deliveryCompanyCode: deliveryInfo.deliveryCompanyCode,
    deliveryChargeType: deliveryInfo.deliveryChargeType,
    deliveryCharge: deliveryInfo.deliveryCharge,
    freeShipOverAmount: deliveryInfo.deliveryChargeType === 'CONDITIONAL_FREE'
      ? (deliveryInfo.freeShipOverAmount || 0)
      : 0,
    deliveryChargeOnReturn: deliveryInfo.deliveryChargeOnReturn,
    remoteAreaDeliverable: 'Y',
    unionDeliveryType: 'NOT_UNION_DELIVERY',
    outboundShippingPlaceCode: deliveryInfo.outboundShippingPlaceCode,

    returnCenterCode: returnInfo.returnCenterCode,
    returnChargeName: returnInfo.returnChargeName || '반품지',
    companyContactNumber: returnInfo.companyContactNumber || '010-0000-0000',
    returnCharge: returnInfo.returnCharge,
    returnZipCode: returnInfo.returnZipCode || '06159',
    returnAddress: returnInfo.returnAddress || '서울특별시 강남구',
    returnAddressDetail: returnInfo.returnAddressDetail || '상세주소',
    // vendorUserId는 Wing ID — 모르면 생략 (쿠팡이 자동 처리)

    requested: true,  // 자동 판매승인 요청

    // 쿠팡 스펙 필드명: "items" (sellerProductItemList가 아님!)
    items: sellerProductItemList,

    extraInfoMessage: '',
    manufacture: resolvedManufacturer,
  };

  return payload;
}

// ---- 헬퍼 함수들 ----

/**
 * 쿠팡 notices 포맷: 중첩 구조 → flat 배열 변환
 * 입력: [{ noticeCategoryName, noticeCategoryDetailName: [{ noticeCategoryDetailName, content }] }]
 * 출력: [{ noticeCategoryName, noticeCategoryDetailName, content }, ...]
 */
function flattenNotices(
  categories: FilledNoticeCategory[],
): { noticeCategoryName: string; noticeCategoryDetailName: string; content: string }[] {
  const flat: { noticeCategoryName: string; noticeCategoryDetailName: string; content: string }[] = [];
  for (const cat of categories) {
    for (const detail of cat.noticeCategoryDetailName) {
      flat.push({
        noticeCategoryName: cat.noticeCategoryName,
        noticeCategoryDetailName: detail.noticeCategoryDetailName,
        content: detail.content || '상세페이지 참조',
      });
    }
  }
  return flat;
}

/** 쿠팡 API 날짜 포맷: yyyy-MM-ddTHH:mm:ss (밀리초/타임존 없음) */
function formatCoupangDateTime(date: Date): string {
  const y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const H = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${d}T${H}:${m}:${s}`;
}

/**
 * 카테고리 경로에서 generalProductName(상품군) 추출
 * 예: "뷰티>스킨>크림>넥크림" → "넥크림"
 * categoryPath가 없으면 상품명 사용
 */
function extractGeneralProductName(categoryPath?: string, fallbackName?: string): string {
  if (categoryPath) {
    const leafName = categoryPath.split('>').pop()?.trim();
    if (leafName) return leafName.slice(0, 100);
  }
  return (fallbackName || '상품').slice(0, 100);
}

function buildSimpleDetailHtml(imageUrls: string[], productName: string): string {
  if (imageUrls.length === 0) return '';
  const safeName = escHtml(productName);
  const imgTags = imageUrls
    .map(
      (url, i) =>
        `<img src="${escHtml(url)}" alt="${safeName} 상세 ${i + 1}" style="width:100%;display:block;" />`,
    )
    .join('\n');
  return `<div style="width:100%;max-width:860px;margin:0 auto;">\n${imgTags}\n</div>`;
}

/**
 * 카테고리 속성 빌드
 * required 속성 중 값이 있는 것만 포함.
 *
 * 주의: buyOptions(구매옵션)는 여기에 넣지 않는다!
 * buyOptions는 item-level(itemName, unitCount 등)에서 처리.
 * attributes는 카테고리 검색 필터용 메타데이터만.
 */
function buildAttributes(
  meta?: AttributeMeta[],
  values?: Record<string, string>,
): { attributeTypeName: string; attributeValueName: string }[] {
  if (!meta || meta.length === 0) return [];

  const attrs: { attributeTypeName: string; attributeValueName: string }[] = [];
  for (const attr of meta) {
    if (!attr.required) continue;

    const userValue = values?.[attr.attributeTypeName];
    const allowedValues = attr.attributeValues?.map((v) => v.attributeValueName) || [];

    if (userValue) {
      // ENUM 타입: 사용자 값이 허용목록에 있는지 검증
      if (allowedValues.length > 0 && !allowedValues.includes(userValue)) {
        console.warn(`[payload-builder] 속성 "${attr.attributeTypeName}" 값 "${userValue}"이 ENUM 허용목록에 없음 → "${allowedValues[0]}" 폴백`);
        attrs.push({
          attributeTypeName: attr.attributeTypeName,
          attributeValueName: allowedValues[0],
        });
      } else {
        attrs.push({
          attributeTypeName: attr.attributeTypeName,
          attributeValueName: userValue,
        });
      }
    } else if (allowedValues.length > 0) {
      // 선택형 필수: 첫 번째 선택지로 폴백
      console.warn(`[payload-builder] 필수 속성 "${attr.attributeTypeName}" 미지정 → "${allowedValues[0]}" 폴백`);
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: allowedValues[0],
      });
    } else if (attr.dataType === 'TEXT' || attr.dataType === 'STRING' || attr.dataType === 'NUMBER') {
      // 자유입력형(TEXT) 필수 속성: attributeValues가 빈 배열이어도 기본값으로 채움
      // skip하면 쿠팡 API가 필수 속성 누락으로 등록 거부함
      const fallbackValue = getAttributeFallback(attr.attributeTypeName);
      console.warn(`[payload-builder] TEXT형 필수 속성 "${attr.attributeTypeName}" → "${fallbackValue}" 폴백`);
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: fallbackValue,
      });
    }
  }
  return attrs;
}

/** TEXT/NUMBER형 필수 속성의 안전한 기본값 */
function getAttributeFallback(attrName: string): string {
  const n = attrName.toLowerCase();
  if (n.includes('원산지') || n.includes('제조국')) return '상세페이지 참조';
  if (n.includes('브랜드')) return '자체브랜드';
  if (n.includes('모델') || n.includes('품번')) return '자체제작';
  if (n.includes('소재') || n.includes('재질')) return '상세페이지 참조';
  if (n.includes('무게') || n.includes('중량')) return '상세페이지 참조';
  if (n.includes('크기') || n.includes('사이즈')) return '상세페이지 참조';
  if (n.includes('색상') || n.includes('컬러')) return '상세페이지 참조';
  return '상세페이지 참조';
}

/**
 * notices 메타 없을 때 카테고리 경로 기반 고시정보 폴백
 * categoryPath가 있으면 적절한 카테고리별 양식 선택 (화장품, 식품, 의류, 가전 등)
 */
function buildFallbackNotice(
  productName: string,
  manufacturer: string,
  contactNumber: string,
  categoryPath?: string,
): FilledNoticeCategory[] {
  const safeName = escHtml(productName.slice(0, 50));
  const safeManuf = manufacturer || '상세페이지 참조';
  const safeContact = contactNumber || '상세페이지 참조';
  // 카테고리 경로와 상품명 모두 활용하여 카테고리 판별
  const hint = ((categoryPath || '') + ' ' + productName).toLowerCase();

  // 화장품/뷰티
  if (/화장품|뷰티|스킨|세럼|로션|크림|마스크팩|선크림|클렌징|토너|에센스|미스트|파운데이션|립|아이/.test(hint)) {
    return [{
      noticeCategoryName: '화장품',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '용량 또는 중량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제품 주요 사양', content: safeName },
        { noticeCategoryDetailName: '사용기한 또는 개봉 후 사용기간', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '사용방법', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: safeManuf },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '화장품법에 따라 기재·표시하여야 하는 모든 성분', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '식품의약품안전처 심사 필 유무', content: '해당사항 없음' },
        { noticeCategoryDetailName: '사용할 때 주의사항', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: '소비자상담 관련 전화번호', content: safeContact },
      ],
    }];
  }

  // 식품
  if (/식품|건강|영양|음료|과자|라면|커피|차\b|건강기능|비타민|프로틴|유산균/.test(hint)) {
    return [{
      noticeCategoryName: '가공식품',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '식품의 유형', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '생산자 및 소재지', content: safeManuf },
        { noticeCategoryDetailName: '제조연월일, 유통기한 또는 품질유지기한', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '포장단위별 내용물의 용량(중량), 수량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '원재료명 및 함량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '영양성분', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '유전자변형식품 여부', content: '해당사항 없음' },
        { noticeCategoryDetailName: '소비자 안전을 위한 주의사항', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '수입식품 문구', content: '해당시 상세페이지 참조' },
        { noticeCategoryDetailName: '소비자상담 관련 전화번호', content: safeContact },
      ],
    }];
  }

  // 의류/패션
  if (/의류|패션|셔츠|바지|티셔츠|자켓|코트|원피스|스커트|니트|후드|점퍼|청바지|레깅스/.test(hint)) {
    return [{
      noticeCategoryName: '의류',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '제품 소재', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '색상', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '치수', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: safeManuf },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '세탁방법 및 취급 시 주의사항', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조연월', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: safeContact },
      ],
    }];
  }

  // 가전/전자
  if (/가전|전자|컴퓨터|노트북|모니터|냉장고|세탁기|에어컨|청소기|디지털|가습기|건조기/.test(hint)) {
    return [{
      noticeCategoryName: '소형전자',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: safeName },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '정격전압, 소비전력', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '에너지소비효율등급', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '동일모델의 출시년월', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: safeManuf },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '크기', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: safeContact },
      ],
    }];
  }

  // 생활용품/주방/욕실
  if (/생활|주방|욕실|세제|수납|청소|인테리어|가구|침구|커튼/.test(hint)) {
    return [{
      noticeCategoryName: '생활용품',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: safeName },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: safeManuf },
        { noticeCategoryDetailName: '소재', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: safeContact },
      ],
    }];
  }

  // 스포츠/레저
  if (/스포츠|레저|운동|피트니스|요가|골프|등산|캠핑|자전거/.test(hint)) {
    return [{
      noticeCategoryName: '스포츠용품',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: safeName },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '크기, 중량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '색상', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: safeManuf },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: safeContact },
      ],
    }];
  }

  // 기타 재화 (기본 폴백)
  return [{
    noticeCategoryName: '기타 재화',
    noticeCategoryDetailName: [
      { noticeCategoryDetailName: '품명 및 모델명', content: safeName },
      { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
      { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
      { noticeCategoryDetailName: '제조자/수입자', content: safeManuf },
      { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: safeContact },
    ],
  }];
}
