/**
 * 공유 페이로드 빌더 — batch/route.ts와 preflight/route.ts가 동일한 코드 경로 사용
 *
 * batch/route.ts의 registerSingleProduct 내부 로직 중 페이로드 빌드 부분만 추출.
 * 이미지 업로드, DB 저장, 쿠팡 API 호출 등은 포함하지 않음.
 */

import { buildCoupangProductPayload, type DeliveryInfo, type ReturnInfo, type AttributeMeta, type CertificationInfo, type OptionVariant } from './coupang-product-builder';
import { fillNoticeFields, type NoticeCategoryMeta, type FilledNoticeCategory, type ExtractedNoticeHints } from './notice-field-filler';
import { extractOptions, type ExtractedOptions } from './option-extractor';
import { selectWithSeed } from './item-winner-prevention';
import type { PreventionConfig } from './item-winner-prevention';
import type { ExtractedBuyOption } from './coupang-product-builder';
import { generateFaqItems, extractSeoKeywords, generateClosingText } from './story-generator';

export interface BuildPayloadProduct {
  uid?: string;
  productCode: string;
  folderPath: string;
  name: string;
  brand: string;
  sellingPrice: number;
  sourcePrice: number;
  categoryCode: string;
  tags: string[];
  description: string;
  mainImages: string[];
  detailImages: string[];
  reviewImages: string[];
  infoImages: string[];
  noticeMeta: NoticeCategoryMeta[];
  attributeMeta: AttributeMeta[];
  aiDisplayName?: string;
  aiSellerName?: string;
  originalPrice?: number;
  barcode?: string;
  certifications?: CertificationInfo[];
  optionVariants?: OptionVariant[];
  taxType?: 'TAX' | 'FREE' | 'ZERO';
  adultOnly?: 'EVERYONE' | 'ADULT_ONLY';
  categoryConfidence?: number;
  categoryPath?: string;        // 카테고리 경로 (예: "뷰티>스킨>크림>넥크림")
  displayProductNameOverride?: string;
  manufacturerOverride?: string;
  itemNameOverride?: string;
  unitCountOverride?: number;
  stockOverride?: number;
  maxBuyPerPersonOverride?: number;
  shippingDaysOverride?: number;
  noticeValuesOverride?: Record<string, string>;
  attributeValuesOverride?: Record<string, string>;
  descriptionOverride?: string;
  storyParagraphsOverride?: string[];
  reviewTextsOverride?: string[];
}

export interface BuildPayloadParams {
  product: BuildPayloadProduct;
  vendorId: string;
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock: number;
  noticeOverrides?: Record<string, string>;
  preventionConfig?: PreventionConfig;
  shUserId: string;
  mainImageUrls: string[];
  detailImageUrls: string[];
  reviewImageUrls: string[];
  infoImageUrls: string[];
  // AI story는 batch에서만 사용 — preflight에서는 빈 값 전달 가능
  aiStoryHtml?: string;
  aiStoryParagraphs?: string[];
  aiReviewTexts?: string[];
  // Wing ID (vendorUserId) — vendorId와 다름
  vendorUserId?: string;
}

export interface BuildPayloadResult {
  payload: Record<string, unknown>;
  filledNotices: FilledNoticeCategory[];
  extractedOptions: ExtractedOptions;
}

/**
 * 쿠팡 상품 등록 API 페이로드를 빌드한다.
 * batch/route.ts와 preflight/route.ts에서 동일하게 사용.
 */
export async function buildProductPayload(params: BuildPayloadParams): Promise<BuildPayloadResult> {
  const {
    product, vendorId, deliveryInfo, returnInfo, stock,
    noticeOverrides, preventionConfig, shUserId,
    mainImageUrls, detailImageUrls, reviewImageUrls, infoImageUrls,
    aiStoryHtml = '', aiStoryParagraphs = [], aiReviewTexts = [],
    vendorUserId,
  } = params;

  const preventionEnabled = preventionConfig?.enabled ?? false;

  const effectiveDescription = product.descriptionOverride ?? product.description;

  // 사용자가 편집한 스토리/리뷰가 있으면 우선 사용
  const finalStoryParagraphs = (product.storyParagraphsOverride && product.storyParagraphsOverride.length > 0)
    ? product.storyParagraphsOverride
    : aiStoryParagraphs;

  const finalReviewTexts = (product.reviewTextsOverride && product.reviewTextsOverride.length > 0)
    ? product.reviewTextsOverride
    : aiReviewTexts;

  // 구매옵션 자동 추출
  const extracted = await extractOptions(product.name, product.categoryCode);

  // 추출된 옵션값을 notices용 hints로 변환
  const noticeHints: ExtractedNoticeHints = {};
  for (const opt of extracted.buyOptions) {
    if (opt.unit === 'ml' || opt.name.includes('용량')) noticeHints.volume = `${opt.value}${opt.unit || 'ml'}`;
    if (opt.unit === 'g' || opt.name.includes('중량')) noticeHints.weight = `${opt.value}${opt.unit || 'g'}`;
    if (opt.name.includes('색상') || opt.name.includes('컬러')) noticeHints.color = opt.value;
    if (opt.name.includes('사이즈') || opt.name.includes('크기')) noticeHints.size = opt.value;
    if (opt.name === '수량') noticeHints.count = `${opt.value}${opt.unit || '개'}`;
  }

  // notices 자동채움
  const mergedNoticeOverrides = { ...(noticeOverrides || {}), ...(product.noticeValuesOverride || {}) };
  const filledNotices = fillNoticeFields(
    product.noticeMeta || [],
    { name: product.name, brand: product.brand, tags: product.tags, description: effectiveDescription },
    returnInfo.afterServiceContactNumber,
    Object.keys(mergedNoticeOverrides).length > 0 ? mergedNoticeOverrides : undefined,
    noticeHints,
    product.categoryPath || product.name,
  );

  // 아이템위너 방지 시드 + 레이아웃 변형
  const preventionSeed = preventionEnabled && preventionConfig?.imageOrderShuffle
    ? `${shUserId}:${product.productCode}`
    : undefined;
  const LAYOUT_VARIANTS = ['A', 'B', 'C', 'D'];
  const detailLayoutVariant = preventionEnabled && preventionConfig?.detailPageVariation
    ? selectWithSeed(LAYOUT_VARIANTS, shUserId)
    : undefined;

  // SEO 데이터 자동 생성 (상세페이지 7섹션 구조용)
  const categoryPath = product.categoryPath || product.name;
  const productIndex = parseInt(product.productCode.replace(/\D/g, ''), 10) || 0;
  const seoKeywords = extractSeoKeywords(product.name, categoryPath, shUserId, productIndex);
  const faqItems = generateFaqItems(product.name, categoryPath, shUserId, productIndex, 4);
  const closingText = generateClosingText(product.name, categoryPath, shUserId, productIndex);

  // 페이로드 빌드
  const effectiveStock = product.stockOverride ?? stock;
  const payload = buildCoupangProductPayload({
    vendorId,
    product: {
      folderPath: product.folderPath,
      productCode: product.productCode,
      productJson: { name: product.name, brand: product.brand, tags: product.tags, description: effectiveDescription, price: product.sourcePrice },
      mainImages: product.mainImages,
      detailImages: product.detailImages,
      infoImages: product.infoImages,
      reviewImages: product.reviewImages,
    },
    sellingPrice: product.sellingPrice,
    categoryCode: product.categoryCode,
    mainImageUrls,
    detailImageUrls,
    deliveryInfo,
    returnInfo,
    stock: effectiveStock,
    brand: product.brand,
    filledNotices,
    attributeMeta: product.attributeMeta || [],
    attributeValues: product.attributeValuesOverride,
    reviewImageUrls,
    infoImageUrls,
    aiStoryHtml,
    aiStoryParagraphs: finalStoryParagraphs,
    aiReviewTexts: finalReviewTexts,
    extractedBuyOptions: extracted.buyOptions as ExtractedBuyOption[],
    totalUnitCount: product.unitCountOverride ?? extracted.totalUnitCount,
    displayProductName: product.displayProductNameOverride || product.aiDisplayName,
    sellerProductName: product.aiSellerName,
    manufacturer: product.manufacturerOverride,
    maximumBuyForPerson: product.maxBuyPerPersonOverride,
    outboundShippingTimeDay: product.shippingDaysOverride,
    originalPrice: product.originalPrice,
    barcode: product.barcode,
    certifications: product.certifications,
    optionVariants: product.optionVariants,
    taxType: product.taxType,
    adultOnly: product.adultOnly,
    preventionSeed,
    detailLayoutVariant,
    categoryPath,
    seoKeywords,
    faqItems,
    closingText,
    vendorUserId,
  });

  return { payload, filledNotices, extractedOptions: extracted };
}
