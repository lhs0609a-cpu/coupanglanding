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
import { checkCompliance } from './compliance-filter';

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
  thirdPartyImageUrls?: string[];   // 제3자 이미지 URLs (랜덤 선정된 2장)
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
  // SEO 상세페이지 신규 필드
  seoKeywords?: string[];
  faqItems?: { question: string; answer: string }[];
  closingText?: string;
  // V2: 설득형 콘텐츠 블록
  contentBlocks?: import('./persuasion-engine').ContentBlock[];
  // Wing ID (vendorUserId) — vendorId와 다름, DB에서 조회하여 전달
  vendorUserId?: string;
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

// ---- 쿠팡 상품명 금지어 필터 (compliance-filter 기반) ----

// 쿠팡 상품명에 추가로 허용되지 않는 특수문자 (규제 금지어와 별도)
const EXTRA_SPECIAL_CHARS = /[!@#$%^&*=+|\\{}[\]<>~`]/g;

function cleanProductName(name: string, categoryContext?: string): string {
  let cleaned = name.trim();

  // 0) "상세페이지 참조" 등 소싱 잔여 구문 제거
  cleaned = cleaned.replace(/상세\s*페이지\s*참조|상품\s*상세\s*참조|상세\s*설명\s*참조|본문\s*참조|상페\s*참조|이미지\s*참조/gi, '');

  // 1) 특수문자 제거 (쿠팡 기본 정책)
  cleaned = cleaned.replace(EXTRA_SPECIAL_CHARS, '');

  // 2) 규제 금지어 자동 제거 (error severity)
  const result = checkCompliance(cleaned, { removeErrors: true, categoryContext });
  cleaned = result.cleanedText;

  // 위반 로깅 (디버그)
  if (result.violations.length > 0) {
    console.log(
      `[compliance] 상품명 금지어 감지: ${result.violations.map((v) => `${v.label}(${v.category})`).join(', ')} | 원본: "${name}"`,
    );
  }

  // 빈 문자열 폴백
  if (!cleaned) {
    cleaned = name.trim().replace(/[!@#$%^&*=+|\\{}[\]<>~`]/g, '').replace(/\s+/g, ' ');
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
    thirdPartyImageUrls,
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
    seoKeywords,
    faqItems,
    closingText,
    contentBlocks,
    vendorUserId,
  } = params;

  // ---- 1. 상품명 정리 ----
  const rawName = product.productJson.name || product.productJson.title || `상품_${product.productCode}`;
  const productName = displayProductName
    ? cleanProductName(displayProductName)
    : cleanProductName(rawName);
  const resolvedSellerName = sellerProductName
    ? cleanProductName(sellerProductName)
    : productName;

  // brand: 항상 앞 2글자만 축약 (비오팜→비오, 종근당→종근, 고려은단헬스→고려)
  const rawBrand = brand || product.productJson.brand || '';
  const resolvedBrand = rawBrand ? rawBrand.slice(0, 2) : '';
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
  // 쿠팡: REPRESENTATION은 1개만 허용, 나머지는 DETAIL
  const images = orderedImageUrls.map((url, i) => ({
    imageOrder: i,
    imageType: i === 0 ? 'REPRESENTATION' : 'DETAIL',
    cdnPath: url,
    vendorPath: url,
  }));

  // ---- 3. 상세페이지 (contents) ----
  console.log(`[payload-builder] 상세페이지 이미지: detail=${detailImageUrls.length}, review=${reviewImageUrls?.length || 0}, info=${infoImageUrls?.length || 0}, consignment=${consignmentImageUrls?.length || 0}, thirdParty=${thirdPartyImageUrls?.length || 0}, noticeFields=${filledNotices?.[0]?.noticeCategoryDetailName?.length || 0}`);
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
      thirdPartyImageUrls,
      seoKeywords,
      faqItems,
      closingText,
      categoryPath,
      contentBlocks,
      noticeFields: filledNotices?.[0]?.noticeCategoryDetailName?.map(f => ({
        name: f.noticeCategoryDetailName,
        value: f.content,
      })),
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
  // filledNotices가 있으면 flattenNotices()로 변환, 없으면 빈 배열 전송
  // 쿠팡 API는 notices 키 필수 — 생략하면 oneOf 다중 매칭 에러 발생
  const noticeCategories: FilledNoticeCategory[] = filledNotices && filledNotices.length > 0
    ? filledNotices
    : [];
  const hasNotices = noticeCategories.length > 0;
  console.log(`[payload-builder] notices: source=${hasNotices ? 'API_META' : 'OMITTED'}, category="${noticeCategories[0]?.noticeCategoryName || 'N/A'}", fields=${noticeCategories[0]?.noticeCategoryDetailName?.length || 0}`);

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
            imageType: i === 0 ? 'REPRESENTATION' : 'DETAIL',
            cdnPath: url,
            vendorPath: url,
          }))
        : images;

      return {
        itemName: (variant.optionName || '').slice(0, 100),
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
        // notices: API 메타 있을 때만 전송, 없으면 키 생략 (잘못된 카테고리 전송 방지)
        notices: hasNotices ? flattenNotices(noticeCategories) : [],
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
      // notices: API 메타 있을 때만 전송, 없으면 키 생략
      notices: hasNotices ? flattenNotices(noticeCategories) : [],
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
    // vendorUserId는 Wing ID — vendorId와 다른 값이므로 별도 전달 시에만 설정
    // batch/route.ts에서 wingUserId가 있을 때 payload에 직접 주입함
    ...(vendorUserId ? { vendorUserId } : {}),

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

