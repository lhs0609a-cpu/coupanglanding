// ============================================================
// 쿠팡 상품 등록 페이로드 빌더
// 쿠팡 OpenAPI v2 상품 등록 스펙에 맞춰 빌드
// ============================================================

import type { LocalProduct } from './local-product-reader';
import type { FilledNoticeCategory } from './notice-field-filler';
import type { ImageVariation } from './image-variation';
import { buildRichDetailPageHtml } from './detail-page-builder';

// ---- 입력 타입 ----

export interface DeliveryInfo {
  deliveryCompanyCode: string;         // 택배사 코드 (CJGLS, HANJIN, LOTTE, EPOST, ...)
  deliveryChargeType: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE'; // 무료/유료/조건부무료
  deliveryCharge: number;              // 기본 배송비 (FREE면 0)
  freeShipOverAmount: number;          // 조건부무료 기준 금액
  deliveryChargeOnReturn: number;      // 반품 편도 배송비
  outboundShippingPlaceCode: string;   // 출고지 코드 (쿠팡 Wing에서 조회)
}

export interface ReturnInfo {
  returnCenterCode: string;            // 반품지 코드 (쿠팡 Wing에서 조회)
  returnCharge: number;                // 반품 편도 배송비
  companyContactNumber: string;        // 판매자 연락처
  afterServiceContactNumber: string;   // A/S 연락처
  afterServiceInformation: string;     // A/S 안내 문구
}

export interface AttributeMeta {
  attributeTypeName: string;
  required: boolean;
  dataType: string;
  attributeValues?: { attributeValueName: string }[];
}

/** 추출된 구매옵션 */
export interface ExtractedBuyOption {
  name: string;
  value: string;
  unit?: string;
}

export interface BuildCoupangPayloadParams {
  vendorId: string;                    // 쿠팡 벤더 ID
  product: LocalProduct;
  sellingPrice: number;
  categoryCode: string;
  mainImageUrls: string[];             // 업로드된 대표이미지 CDN URLs
  detailImageUrls: string[];           // 업로드된 상세페이지 CDN URLs
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
  brand?: string;
  manufacturer?: string;
  maximumBuyForPerson?: number;        // 1인당 구매 제한 (0=무제한)
  outboundShippingTimeDay?: number;    // 출고 소요일
  // 동적 notices / attributes / 리치 상세페이지
  filledNotices?: FilledNoticeCategory[];   // 동적으로 채운 notices
  attributeMeta?: AttributeMeta[];         // 카테고리 속성 메타
  attributeValues?: Record<string, string>; // 속성 값 매핑
  reviewImageUrls?: string[];              // 리뷰 CDN URLs
  infoImageUrls?: string[];                // 상품정보 CDN URLs
  aiStoryHtml?: string;                    // AI 스토리 HTML
  // 구매옵션 (option-extractor에서 추출된 값)
  extractedBuyOptions?: ExtractedBuyOption[];
  // AI 생성 상품명 (제공 시 기본 상품명 대신 사용)
  displayProductName?: string;
  sellerProductName?: string;
  // 이미지 변형 파라미터 (로깅/추적용)
  imageVariation?: ImageVariation;
}

// ---- 빌드 함수 ----

/**
 * 쿠팡 상품 등록 API 페이로드를 빌드한다.
 *
 * POST /v2/providers/seller_api/apis/api/v1/vendor/sellers/{vendorId}/products
 *
 * 핵심 구조:
 * - images[]          → 대표이미지 (REPRESENTATION 타입만, 최대 10장)
 * - contents[]        → 상세페이지 (IMAGE_VENDOR 타입 HTML)
 * - noticeCategories  → 상품정보제공고시 (동적)
 * - attributes[]      → 카테고리 필수 속성 (동적)
 */
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
    filledNotices,
    attributeMeta,
    attributeValues,
    reviewImageUrls,
    infoImageUrls,
    aiStoryHtml,
    extractedBuyOptions,
    displayProductName,
    sellerProductName,
    imageVariation,
  } = params;

  // ---- 1. 상품명 정리 ----
  const rawName = product.productJson.name || product.productJson.title || `상품_${product.productCode}`;
  const productName = displayProductName
    ? cleanProductName(displayProductName)
    : cleanProductName(rawName);
  const resolvedSellerName = sellerProductName
    ? cleanProductName(sellerProductName)
    : productName;

  const resolvedBrand = brand || product.productJson.brand || '';
  const resolvedManufacturer = manufacturer || product.productJson.brand || '';

  // ---- 2. 대표이미지 (REPRESENTATION) ----
  const images = mainImageUrls.slice(0, 10).map((url, i) => ({
    imageOrder: i,
    imageType: 'REPRESENTATION',
    cdnPath: url,
    vendorPath: url,
  }));

  // ---- 3. 상세페이지 (contents) ----
  const hasRichContent = aiStoryHtml || (reviewImageUrls && reviewImageUrls.length > 0) || (infoImageUrls && infoImageUrls.length > 0);
  let detailHtml: string;

  if (hasRichContent) {
    // 리치 상세페이지
    detailHtml = buildRichDetailPageHtml({
      productName,
      brand: resolvedBrand,
      aiStoryHtml,
      reviewImageUrls,
      detailImageUrls,
      infoImageUrls,
    });
  } else {
    // 기본: 이미지 나열
    detailHtml = buildSimpleDetailHtml(detailImageUrls, productName);
  }

  const contents = detailHtml
    ? [
        {
          contentsType: 'IMAGE_VENDOR',
          contentDetails: [
            {
              content: detailHtml,
              detailType: 'TEXT',
            },
          ],
        },
      ]
    : [];

  // ---- 4. 상품정보제공고시 (noticeCategories) ----
  const noticeCategories = filledNotices && filledNotices.length > 0
    ? filledNotices
    : buildFallbackNotice(productName, resolvedManufacturer, returnInfo.afterServiceContactNumber);

  // ---- 5. attributes (카테고리 필수 속성) ----
  // 추출된 구매옵션 값도 attributeValues에 병합
  const mergedAttributeValues = { ...(attributeValues || {}) };
  if (extractedBuyOptions) {
    for (const opt of extractedBuyOptions) {
      const key = opt.name;
      if (!mergedAttributeValues[key]) {
        // 단위가 있으면 "숫자단위" 형태로 (예: "200ml", "500g")
        mergedAttributeValues[key] = opt.unit ? `${opt.value}${opt.unit}` : opt.value;
      }
    }
  }
  const attributes = buildAttributes(attributeMeta, mergedAttributeValues);

  // ---- 6. unitCount 계산 ----
  // 추출된 구매옵션에서 "수량" 값을 가져옴
  let unitCount = 1;
  if (extractedBuyOptions) {
    const countOpt = extractedBuyOptions.find(
      (o) => o.name === '수량' || o.name.includes('수량'),
    );
    if (countOpt) {
      const parsed = parseInt(countOpt.value, 10);
      if (!isNaN(parsed) && parsed > 0) unitCount = parsed;
    }
  }

  // ---- 7. itemName에 옵션 정보 포함 ----
  // 쿠팡은 itemName에 옵션 값을 포함하는 것을 권장
  // 예: "넥크림 50ml, 3개" → 고객이 옵션 구분 가능
  let itemName = productName;
  if (extractedBuyOptions && extractedBuyOptions.length > 0) {
    const optParts: string[] = [];
    for (const opt of extractedBuyOptions) {
      if (opt.name === '수량') continue; // 수량은 unitCount로 처리
      if (opt.unit) {
        optParts.push(`${opt.value}${opt.unit}`);
      } else if (opt.name.includes('색상') || opt.name.includes('사이즈')) {
        optParts.push(opt.value);
      }
    }
    if (optParts.length > 0) {
      const optStr = optParts.join(', ');
      itemName = `${productName} (${optStr})`;
      if (itemName.length > 100) itemName = itemName.slice(0, 100);
    }
  }

  // ---- 8. 전체 페이로드 조립 ----
  const payload: Record<string, unknown> = {
    displayCategoryCode: Number(categoryCode),
    sellerProductName: resolvedSellerName,
    vendorId,
    saleStartedAt: new Date().toISOString().replace('Z', ''),
    saleEndedAt: '2099-01-01T23:59:59',
    displayProductName: productName,
    brand: resolvedBrand,
    generalProductName: productName.slice(0, 100),
    productGroup: '',
    manufacture: resolvedManufacturer,

    deliveryMethod: 'SEQUENCIAL',
    deliveryCompanyCode: deliveryInfo.deliveryCompanyCode,
    deliveryChargeType: deliveryInfo.deliveryChargeType,
    deliveryCharge: deliveryInfo.deliveryCharge,
    freeShipOverAmount: deliveryInfo.freeShipOverAmount,
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

    sellerProductItemList: [
      {
        itemName,
        originalPrice: sellingPrice,
        salePrice: sellingPrice,
        maximumBuyCount: stock,
        maximumBuyForPerson,
        maximumBuyForPersonPeriod: 1,
        outboundShippingTimeDay,
        unitCount,
        adultOnly: 'EVERYONE',
        taxType: 'TAX',
        parallelImported: 'NOT_PARALLEL_IMPORTED',
        overseasPurchased: 'NOT_OVERSEAS_PURCHASED',
        pccNeeded: false,
        externalVendorSku: product.productCode,
        barcode: '',
        emptyBarcode: true,
        certificationListByItem: [],
        images,
        noticeCategories,
        attributes,
        contents,
      },
    ],

    requiredDocuments: [],
    extraInfoMessage: '',

    // 내부 추적용 메타데이터 (쿠팡 API에는 전송되지 않음)
    ...(imageVariation ? { _meta: { imageVariation } } : {}),
  };

  return payload;
}

// ---- 헬퍼 함수들 ----

function cleanProductName(name: string): string {
  let cleaned = name.trim();
  cleaned = cleaned.replace(/\s+/g, ' ');
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100);
  }
  return cleaned;
}

/**
 * 기본 상세페이지: 이미지 단순 나열
 */
function buildSimpleDetailHtml(imageUrls: string[], productName: string): string {
  if (imageUrls.length === 0) return '';
  const imgTags = imageUrls
    .map(
      (url, i) =>
        `<img src="${url}" alt="${productName} 상세 ${i + 1}" style="width:100%;display:block;" />`,
    )
    .join('\n');
  return `<div style="width:100%;max-width:860px;margin:0 auto;">\n${imgTags}\n</div>`;
}

/**
 * 카테고리 속성 빌드
 * required 속성 중 값이 있는 것만 포함, 없으면 빈 배열
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
    if (userValue) {
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: userValue,
      });
    } else if (attr.attributeValues && attr.attributeValues.length > 0) {
      // 필수인데 값 미지정 → 첫 번째 선택지로 폴백
      attrs.push({
        attributeTypeName: attr.attributeTypeName,
        attributeValueName: attr.attributeValues[0].attributeValueName,
      });
    }
  }
  return attrs;
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
        { noticeCategoryDetailName: '품명 및 모델명', content: productName.slice(0, 50) },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: manufacturer || '상세페이지 참조' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    },
  ];
}
