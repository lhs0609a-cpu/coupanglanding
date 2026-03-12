// ============================================================
// 쿠팡 상품 등록 페이로드 빌더
// 쿠팡 OpenAPI v2 상품 등록 스펙에 맞춰 빌드
// ============================================================

import type { LocalProduct } from './local-product-reader';

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
}

// ---- 빌드 함수 ----

/**
 * 쿠팡 상품 등록 API 페이로드를 빌드한다.
 *
 * POST /v2/providers/seller_api/apis/api/v1/vendor/sellers/{vendorId}/products
 *
 * 핵심 구조:
 * - images[]          → 대표이미지 (REPRESENTATION 타입만, 최대 10장)
 * - contents[]        → 상세페이지 이미지들 (IMAGE_VENDOR 타입 HTML)
 * - noticeCategories  → 상품정보제공고시
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
  } = params;

  // ---- 1. 상품명 정리 ----
  const rawName = product.productJson.name || product.productJson.title || `상품_${product.productCode}`;
  const productName = cleanProductName(rawName);

  const resolvedBrand = brand || product.productJson.brand || '';
  const resolvedManufacturer = manufacturer || product.productJson.brand || '';

  // ---- 2. 대표이미지 (REPRESENTATION) ----
  // 쿠팡: images[] 에는 REPRESENTATION 타입만 (상품 리스팅 메인 사진)
  // 최대 10장, imageOrder 0부터
  const images = mainImageUrls.slice(0, 10).map((url, i) => ({
    imageOrder: i,
    imageType: 'REPRESENTATION',
    cdnPath: url,
    vendorPath: url,
  }));

  // ---- 3. 상세페이지 (contents) ----
  // 쿠팡: sellerProductItemList[].contents[] 에 상세 설명 이미지를 넣는다.
  // contentsType: "IMAGE_VENDOR" → contentDetails[].content = HTML
  const detailHtml = buildDetailPageHtml(detailImageUrls, productName);
  const contents = detailImageUrls.length > 0
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
  const noticeCategories = [
    {
      noticeCategoryName: '기타 재화',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: productName.slice(0, 50) },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: resolvedManufacturer || '상세페이지 참조' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: returnInfo.afterServiceContactNumber || '상세페이지 참조' },
      ],
    },
  ];

  // ---- 5. 전체 페이로드 조립 ----
  const payload: Record<string, unknown> = {
    // 상품 기본 정보
    displayCategoryCode: Number(categoryCode),
    sellerProductName: productName,
    vendorId,
    saleStartedAt: new Date().toISOString().replace('Z', ''),
    saleEndedAt: '2099-01-01T23:59:59',
    displayProductName: productName,
    brand: resolvedBrand,
    generalProductName: productName.slice(0, 100),
    productGroup: '',
    manufacture: resolvedManufacturer,

    // 배송 정보
    deliveryMethod: 'SEQUENCIAL',
    deliveryCompanyCode: deliveryInfo.deliveryCompanyCode,
    deliveryChargeType: deliveryInfo.deliveryChargeType,
    deliveryCharge: deliveryInfo.deliveryCharge,
    freeShipOverAmount: deliveryInfo.freeShipOverAmount,
    deliveryChargeOnReturn: deliveryInfo.deliveryChargeOnReturn,
    remoteAreaDeliverable: 'Y',
    unionDeliveryType: 'NOT_UNION_DELIVERY',
    outboundShippingPlaceCode: deliveryInfo.outboundShippingPlaceCode,

    // 반품 정보
    returnCenterCode: returnInfo.returnCenterCode,
    returnChargeName: '반품배송비',
    returnCharge: returnInfo.returnCharge,
    companyContactNumber: returnInfo.companyContactNumber,
    afterServiceInformation: returnInfo.afterServiceInformation || '상품 이상 시 고객센터로 연락 바랍니다.',
    afterServiceContactNumber: returnInfo.afterServiceContactNumber,

    // 아이템(SKU) 목록 — 단일 옵션 상품
    sellerProductItemList: [
      {
        itemName: productName,
        originalPrice: sellingPrice,
        salePrice: sellingPrice,
        maximumBuyCount: stock,
        maximumBuyForPerson,
        maximumBuyForPersonPeriod: 1,
        outboundShippingTimeDay,
        unitCount: 1,
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
        attributes: [],
        contents,
      },
    ],

    requiredDocuments: [],
    extraInfoMessage: '',
  };

  return payload;
}

// ---- 헬퍼 함수들 ----

/**
 * 상품명에서 키워드 중복 제거 및 정리
 * - 쿠팡 상품명 최대 100자
 * - 연속 공백 제거, trim
 */
function cleanProductName(name: string): string {
  let cleaned = name.trim();
  // 연속 공백 → 하나
  cleaned = cleaned.replace(/\s+/g, ' ');
  // 100자 제한
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100);
  }
  return cleaned;
}

/**
 * 상세페이지 이미지들을 HTML로 조립
 * - 각 이미지를 <img> 태그로 세로 배치
 * - width 100% 반응형
 */
function buildDetailPageHtml(imageUrls: string[], productName: string): string {
  if (imageUrls.length === 0) return '';

  const imgTags = imageUrls
    .map(
      (url, i) =>
        `<img src="${url}" alt="${productName} 상세 ${i + 1}" style="width:100%;display:block;" />`,
    )
    .join('\n');

  return `<div style="width:100%;max-width:860px;margin:0 auto;">\n${imgTags}\n</div>`;
}
