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
  // 아이템위너 방지: preventionSeed가 있으면 이미지 순서를 셔플
  const orderedImageUrls = preventionSeed
    ? shuffleWithSeed(mainImageUrls.slice(0, 10), preventionSeed)
    : mainImageUrls.slice(0, 10);
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
        contentsType: 'IMAGE_VENDOR',
        contentDetails: [{ content: detailHtml, detailType: 'TEXT' }],
      }]
    : [];

  // ---- 4. 상품정보제공고시 (noticeCategories) ----
  const noticeCategories = filledNotices && filledNotices.length > 0
    ? filledNotices
    : buildFallbackNotice(productName, resolvedManufacturer, returnInfo.afterServiceContactNumber);

  // ---- 5. attributes (카테고리 필수 속성 — buyOptions와 분리!) ----
  // attributes는 카테고리 검색 필터용 메타데이터만 넣는다.
  // extractedBuyOptions는 여기에 넣지 않는다 (item-level에서 처리).
  const attributes = buildAttributes(attributeMeta, attributeValues);

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
        certificationListByItem: certificationList,
        images: variantImages,
        noticeCategories,
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
      pccNeeded,
      externalVendorSku: product.productCode,
      barcode: resolvedBarcode,
      emptyBarcode: !hasBarcode,
      certificationListByItem: certificationList,
      images,
      noticeCategories,
      attributes,
      contents,
    }];
  }

  // ---- 12. 전체 페이로드 조립 ----
  // 주의: _meta 등 내부 필드를 페이로드에 포함하지 않음 (쿠팡 API 거부 방지)
  const payload: Record<string, unknown> = {
    displayCategoryCode: Number(categoryCode),
    sellerProductName: resolvedSellerName,
    vendorId,
    saleStartedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
    saleEndedAt: '2099-01-01T23:59:59',
    displayProductName: productName,
    brand: resolvedBrand,
    generalProductName: productName.slice(0, 100),
    productGroup: '',
    manufacturer: resolvedManufacturer,

    deliveryMethod: 'SEQUENTIAL',   // 오타 수정 (SEQUENCIAL → SEQUENTIAL)
    deliveryCompanyCode: deliveryInfo.deliveryCompanyCode,
    deliveryChargeType: deliveryInfo.deliveryChargeType,
    deliveryCharge: deliveryInfo.deliveryCharge,
    freeShipOverAmount: deliveryInfo.deliveryChargeType === 'CONDITIONAL_FREE'
      ? deliveryInfo.freeShipOverAmount
      : 0,
    deliveryChargeOnReturn: deliveryInfo.deliveryChargeOnReturn,
    remoteAreaDeliverable: 'Y',
    unionDeliveryType: 'NOT_UNION_DELIVERY',
    outboundShippingPlaceCode: deliveryInfo.outboundShippingPlaceCode,

    returnCenterCode: returnInfo.returnCenterCode,
    returnChargeName: '반품배송비',
    returnCharge: returnInfo.returnCharge,
    companyContactNumber: returnInfo.companyContactNumber,
    afterServiceInformation: returnInfo.afterServiceInformation || '상품 이상 시 고객센터로 연락 바랍니다.',
    afterServiceContactNumber: returnInfo.afterServiceContactNumber,

    sellerProductItemList,

    requiredDocuments: [],
    extraInfoMessage: '',
  };

  return payload;
}

// ---- 헬퍼 함수들 ----

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
 * notices 메타 없을 때 기본 "기타 재화" 폴백
 */
function buildFallbackNotice(
  productName: string,
  manufacturer: string,
  contactNumber: string,
): FilledNoticeCategory[] {
  return [
    {
      noticeCategoryName: '기타 재화',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: escHtml(productName.slice(0, 50)) },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: manufacturer || '상세페이지 참조' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    },
  ];
}
