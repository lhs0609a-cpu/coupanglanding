/**
 * 대량 등록 사전 검증 엔진
 * - validateProductLocal(): 즉시 실행 (API 불필요)
 * - validateProductDeep(): 카테고리 메타 기반 (API 필요)
 */

import type { PreflightIssue } from '@/lib/megaload/types';

// ---- 타입 ----

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationStatus = 'ready' | 'warning' | 'error' | 'pending';

export interface ValidationIssue {
  field: string;        // 'name' | 'sellingPrice' | 'category' | 'images' | 'brand' | 'attributes' | 'sourcePrice' | 'margin'
  severity: ValidationSeverity;
  message: string;
  fixSuggestion?: string;
}

export interface ProductValidationResult {
  status: ValidationStatus;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  isRegisterable: boolean;  // errors.length === 0
}

/** validateProductLocal에 넘겨줄 최소 필드 */
export interface LocalValidationInput {
  editedName: string;
  editedSellingPrice: number;
  editedCategoryCode: string;
  editedBrand: string;
  sourcePrice: number;
  mainImageCount: number;
  scannedMainImages?: { name: string }[];
}

/** 카테고리 메타데이터 (딥 검증용) */
export interface CategoryMetadata {
  noticeMeta: {
    noticeCategoryName: string;
    fields: { name: string; required: boolean }[];
  }[];
  attributeMeta: {
    attributeTypeName: string;
    required: boolean;
    dataType: string;
    attributeValues?: { attributeValueName: string }[];
  }[];
}

// ---- 로컬 검증 (즉시 실행) ----

export function validateProductLocal(product: LocalValidationInput): ProductValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 상품명 검증
  const name = product.editedName?.trim() || '';
  if (!name) {
    errors.push({
      field: 'name',
      severity: 'error',
      message: '상품명이 비어있습니다.',
      fixSuggestion: '상품명을 입력해주세요.',
    });
  } else {
    if (name.length > 100) {
      errors.push({
        field: 'name',
        severity: 'error',
        message: `상품명이 ${name.length}자입니다. (최대 100자)`,
        fixSuggestion: '100자 이내로 줄여주세요.',
      });
    }
    if (name.length < 10) {
      warnings.push({
        field: 'name',
        severity: 'warning',
        message: `상품명이 ${name.length}자로 너무 짧습니다. (권장 10자 이상)`,
        fixSuggestion: '검색 노출을 위해 키워드를 추가해보세요.',
      });
    }
  }

  // 판매가 검증
  const price = product.editedSellingPrice;
  if (!price || price < 100) {
    errors.push({
      field: 'sellingPrice',
      severity: 'error',
      message: price <= 0 ? '판매가가 0원입니다.' : `판매가가 ${price}원입니다. (최소 100원)`,
      fixSuggestion: '100원 이상의 판매가를 설정해주세요.',
    });
  } else if (price > 100_000_000) {
    errors.push({
      field: 'sellingPrice',
      severity: 'error',
      message: '판매가가 1억원을 초과합니다.',
      fixSuggestion: '적정 판매가를 입력해주세요.',
    });
  }

  // 원가 검증
  if (product.sourcePrice <= 0) {
    warnings.push({
      field: 'sourcePrice',
      severity: 'warning',
      message: '원가가 0원입니다. 마진 계산이 불가능합니다.',
      fixSuggestion: '원가를 확인해주세요.',
    });
  }

  // 역마진 검증
  if (product.sourcePrice > 0 && price > 0 && price < product.sourcePrice) {
    warnings.push({
      field: 'margin',
      severity: 'warning',
      message: `역마진: 판매가(${price.toLocaleString()}원) < 원가(${product.sourcePrice.toLocaleString()}원)`,
      fixSuggestion: '판매가를 원가 이상으로 설정해주세요.',
    });
  }

  // 카테고리 검증
  const catCode = product.editedCategoryCode?.trim() || '';
  if (!catCode || catCode === '0' || catCode === 'NaN') {
    errors.push({
      field: 'category',
      severity: 'error',
      message: '카테고리가 선택되지 않았습니다.',
      fixSuggestion: '카테고리를 검색하여 선택해주세요.',
    });
  }

  // 대표이미지 검증
  const imageCount = product.scannedMainImages?.length ?? product.mainImageCount ?? 0;
  if (imageCount === 0) {
    errors.push({
      field: 'images',
      severity: 'error',
      message: '대표이미지가 없습니다. (최소 1장 필요)',
      fixSuggestion: 'main_images 폴더에 이미지를 추가해주세요.',
    });
  } else if (imageCount > 10) {
    warnings.push({
      field: 'images',
      severity: 'warning',
      message: `대표이미지가 ${imageCount}장입니다. (최대 10장 등록)`,
      fixSuggestion: '10장을 초과하면 처음 10장만 등록됩니다.',
    });
  }

  // 브랜드 검증
  if (!product.editedBrand?.trim()) {
    warnings.push({
      field: 'brand',
      severity: 'warning',
      message: '브랜드가 비어있습니다.',
      fixSuggestion: '일부 카테고리에서는 브랜드가 필수입니다.',
    });
  }

  // 최종 상태 결정
  const status: ValidationStatus = errors.length > 0
    ? 'error'
    : warnings.length > 0
      ? 'warning'
      : 'ready';

  return {
    status,
    errors,
    warnings,
    isRegisterable: errors.length === 0,
  };
}

// ---- 딥 검증 (카테고리 메타 기반) ----

export function validateProductDeep(
  product: LocalValidationInput,
  categoryMeta: CategoryMetadata | undefined,
  contactNumber?: string,
  userAttributeValues?: Record<string, string>,
): ProductValidationResult {
  // 먼저 로컬 검증 실행
  const localResult = validateProductLocal(product);
  const errors = [...localResult.errors];
  const warnings = [...localResult.warnings];

  // 카테고리 메타가 없으면 로컬 결과만 반환
  if (!categoryMeta) {
    return localResult;
  }

  // 필수 속성 검증 (빌더가 fallback 처리하므로 error → warning)
  const requiredAttributes = categoryMeta.attributeMeta.filter((a) => a.required);
  for (const attr of requiredAttributes) {
    const userVal = userAttributeValues?.[attr.attributeTypeName];

    if (attr.dataType === 'ENUM' || (attr.attributeValues && attr.attributeValues.length > 0)) {
      // ENUM 타입: 사용자 제공값이 허용목록에 있는지 검증
      const allowedValues = attr.attributeValues?.map((v) => v.attributeValueName) || [];
      if (userVal) {
        if (allowedValues.length > 0 && !allowedValues.includes(userVal)) {
          warnings.push({
            field: 'attributes',
            severity: 'warning',
            message: `속성 "${attr.attributeTypeName}" 값 "${userVal}"이 허용목록에 없습니다. "${allowedValues[0]}"으로 자동 선택됩니다.`,
            fixSuggestion: `허용값: ${allowedValues.slice(0, 5).join(', ')}${allowedValues.length > 5 ? ' ...' : ''}`,
          });
        }
      } else if (allowedValues.length > 0) {
        warnings.push({
          field: 'attributes',
          severity: 'warning',
          message: `필수 속성 "${attr.attributeTypeName}" 미지정 → "${allowedValues[0]}" 자동 선택됩니다.`,
        });
      } else {
        warnings.push({
          field: 'attributes',
          severity: 'warning',
          message: `필수 속성 "${attr.attributeTypeName}" 선택지가 없습니다.`,
          fixSuggestion: '카테고리 메타를 확인해주세요.',
        });
      }
    } else {
      // TEXT/STRING/NUMBER 타입
      if (!userVal) {
        warnings.push({
          field: 'attributes',
          severity: 'warning',
          message: `필수 속성 "${attr.attributeTypeName}" 미입력 → "상세페이지 참조" 자동입력됩니다.`,
        });
      }
    }
  }

  // 고시정보 필수 필드 전체 검증 (#1)
  for (const notice of categoryMeta.noticeMeta) {
    for (const field of notice.fields) {
      if (!field.required) continue;
      const fn = field.name.toLowerCase();
      if (fn.includes('a/s') || fn.includes('전화번호') || fn.includes('책임자')) {
        if (!contactNumber?.trim()) {
          warnings.push({
            field: 'contact',
            severity: 'warning',
            message: `고시정보 "${notice.noticeCategoryName}" — A/S 연락처가 미입력입니다.`,
            fixSuggestion: 'Step 1에서 판매자 연락처를 입력해주세요.',
          });
        }
      } else if (fn.includes('유효기한') || fn.includes('사용기한') || fn.includes('소비기한')) {
        warnings.push({
          field: 'notices',
          severity: 'info' as ValidationSeverity,
          message: `고시 "${field.name}" — 식품류 유효기한 필드가 "상세페이지 참조"로 자동입력됩니다.`,
        });
      } else {
        // 기타 필수 필드: 자동입력됨 info
        warnings.push({
          field: 'notices',
          severity: 'info' as ValidationSeverity,
          message: `고시 "${field.name}" — 필수 필드가 자동입력됩니다.`,
        });
      }
    }
  }

  // 최종 상태
  const deepStatus: ValidationStatus = errors.length > 0
    ? 'error'
    : warnings.length > 0
      ? 'warning'
      : 'ready';

  return {
    status: deepStatus,
    errors,
    warnings,
    isRegisterable: errors.length === 0,
  };
}

// ---- Dry-Run 검증 (실제 페이로드 수준 사전 검증) ----

/** Dry-Run 검증 입력 */
export interface DryRunValidationInput extends LocalValidationInput {
  outboundShippingPlaceCode?: string;
  returnCenterCode?: string;
  deliveryChargeType?: string;
  deliveryCharge?: number;
  returnCharge?: number;
  contactNumber?: string;
  stock?: number;
  detailImageCount?: number;
  infoImageCount?: number;
  reviewImageCount?: number;
}

export interface PayloadPreview {
  displayCategoryCode: number;
  sellerProductName: string;
  imageCount: number;
  noticeCategoryCount: number;
  attributeCount: number;
  hasDetailPage: boolean;
  deliveryChargeType: string;
  stock: number;
}

export interface DryRunResult extends ProductValidationResult {
  payloadPreview: PayloadPreview;
  missingRequiredFields: string[];
}

/**
 * Dry-Run 검증: 실제 쿠팡 API 페이로드를 시뮬레이션하여 구조적 문제를 사전 발견
 *
 * 검증 항목:
 * 1. 모든 로컬 + 딥 검증 항목
 * 2. 배송/반품 설정 누락
 * 3. notices 필수 필드 충족 여부
 * 4. attributes 필수 항목 폴백 가능 여부
 * 5. 이미지 수량 규격 (대표 1-10, 상세 1+)
 * 6. stock > 0
 */
export function validateDryRun(
  product: DryRunValidationInput,
  categoryMeta: CategoryMetadata | undefined,
): DryRunResult {
  const deepResult = validateProductDeep(product, categoryMeta, product.contactNumber);
  const errors = [...deepResult.errors];
  const warnings = [...deepResult.warnings];
  const missingRequiredFields: string[] = [];

  // 배송 설정 검증
  if (!product.outboundShippingPlaceCode) {
    errors.push({ field: 'delivery', severity: 'error', message: '출고지가 설정되지 않았습니다.', fixSuggestion: 'Step 1에서 출고지를 선택해주세요.' });
    missingRequiredFields.push('outboundShippingPlaceCode');
  }
  if (!product.returnCenterCode) {
    errors.push({ field: 'delivery', severity: 'error', message: '반품지가 설정되지 않았습니다.', fixSuggestion: 'Step 1에서 반품지를 선택해주세요.' });
    missingRequiredFields.push('returnCenterCode');
  }

  // 배송비 타입 검증
  const validChargeTypes = ['FREE', 'NOT_FREE', 'CONDITIONAL_FREE'];
  if (product.deliveryChargeType && !validChargeTypes.includes(product.deliveryChargeType)) {
    errors.push({ field: 'delivery', severity: 'error', message: `잘못된 배송비 유형: ${product.deliveryChargeType}` });
  }

  // stock 검증
  const stock = product.stock ?? 999;
  if (stock <= 0) {
    errors.push({ field: 'stock', severity: 'error', message: '재고 수량이 0입니다.', fixSuggestion: '1 이상의 재고 수량을 설정해주세요.' });
    missingRequiredFields.push('stock');
  }

  // 상세이미지 검증
  const detailCount = product.detailImageCount ?? 0;
  if (detailCount === 0) {
    warnings.push({ field: 'detailImages', severity: 'warning', message: '상세 이미지가 없습니다.', fixSuggestion: 'output/ 폴더에 상세 이미지를 추가해주세요.' });
  }

  // notices 필수 필드 전체 검증
  if (categoryMeta && categoryMeta.noticeMeta.length > 0) {
    for (const notice of categoryMeta.noticeMeta) {
      for (const field of notice.fields.filter((f) => f.required)) {
        const fn = field.name.toLowerCase();
        if ((fn.includes('a/s') || fn.includes('전화번호') || fn.includes('책임자')) && !product.contactNumber?.trim()) {
          missingRequiredFields.push(`고시:${notice.noticeCategoryName}/${field.name}`);
        }
      }
    }
  }

  // attributes 필수 항목 — 폴백 가능 여부 표시
  if (categoryMeta) {
    for (const attr of categoryMeta.attributeMeta.filter((a) => a.required)) {
      const hasEnum = attr.attributeValues && attr.attributeValues.length > 0;
      const isText = attr.dataType === 'TEXT' || attr.dataType === 'STRING' || attr.dataType === 'NUMBER';
      if (!hasEnum && !isText) {
        missingRequiredFields.push(`속성:${attr.attributeTypeName}`);
      }
      // ENUM과 TEXT는 빌더가 fallback 처리하므로 missing에 추가하지 않음
    }
  }

  const imageCount = product.scannedMainImages?.length ?? product.mainImageCount ?? 0;
  const catCode = product.editedCategoryCode?.trim() || '0';

  const payloadPreview: PayloadPreview = {
    displayCategoryCode: Number(catCode) || 0,
    sellerProductName: (product.editedName || '').trim().slice(0, 100),
    imageCount: Math.min(imageCount, 10),
    noticeCategoryCount: categoryMeta?.noticeMeta?.length || 1,
    attributeCount: categoryMeta?.attributeMeta?.filter((a) => a.required)?.length ?? 0,
    hasDetailPage: detailCount > 0,
    deliveryChargeType: product.deliveryChargeType || 'FREE',
    stock,
  };

  const finalStatus: ValidationStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ready';

  return {
    status: finalStatus,
    errors,
    warnings,
    isRegisterable: errors.length === 0,
    payloadPreview,
    missingRequiredFields,
  };
}

// ---- 프리플라이트 페이로드 구조 검증 ----

export interface PayloadStructureInput {
  payload: Record<string, unknown>;
  categoryMeta?: CategoryMetadata;
  imageTimestamp?: number; // 이미지 업로드 시각 (epoch ms)
}

/**
 * 실제 빌드된 쿠팡 API 페이로드를 구조적으로 엄격 검증.
 * 프리플라이트 단계에서 호출하여 API 호출 전에 문제를 잡아냄.
 */
export function validatePayloadStructure(input: PayloadStructureInput): {
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
} {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  const { payload, categoryMeta, imageTimestamp } = input;

  // 1. sellerProductName 길이
  const sellerName = (payload.sellerProductName as string) || '';
  if (!sellerName || sellerName.length === 0) {
    errors.push({ code: 'NAME_LENGTH', field: 'sellerProductName', message: '판매자상품명이 비어있습니다.' });
  } else if (sellerName.length > 100) {
    errors.push({ code: 'NAME_LENGTH', field: 'sellerProductName', message: `판매자상품명이 ${sellerName.length}자입니다. (최대 100자)` });
  }

  // 2. displayProductName 길이
  const displayName = (payload.displayProductName as string) || '';
  if (displayName && displayName.length > 100) {
    errors.push({ code: 'DISPLAY_NAME_LENGTH', field: 'displayProductName', message: `노출상품명이 ${displayName.length}자입니다. (최대 100자)` });
  }

  // 3. images >= 1
  const items = ((payload.items || payload.sellerProductItemList) as Record<string, unknown>[]) || [];
  const firstItem = items[0] || {};
  const images = (firstItem.images as Record<string, unknown>[]) || [];
  if (images.length === 0) {
    errors.push({ code: 'NO_IMAGES', field: 'images', message: '대표이미지가 없습니다. 최소 1장 필요합니다.' });
  }

  // 4. salePrice 범위
  const salePrice = (firstItem.salePrice as number) || 0;
  if (salePrice < 100) {
    errors.push({ code: 'PRICE_RANGE', field: 'salePrice', message: `판매가가 ${salePrice}원입니다. (최소 100원)` });
  } else if (salePrice > 100_000_000) {
    errors.push({ code: 'PRICE_RANGE', field: 'salePrice', message: '판매가가 1억원을 초과합니다.' });
  }

  // 5. stock > 0
  const maximumBuyCount = (firstItem.maximumBuyCount as number) || 0;
  // 쿠팡 페이로드에서는 stock 정보를 직접 체크하기 어려움 — maximumBuyCount로 대체 가능
  // 실제 stock은 별도 전달되므로 payload 내에서는 pass

  // 6. outboundShippingPlaceCode
  const outbound = (payload.outboundShippingPlaceCode as string) || '';
  if (!outbound) {
    errors.push({ code: 'NO_OUTBOUND', field: 'outboundShippingPlaceCode', message: '출고지 코드가 없습니다.' });
  }

  // 7. returnCenterCode
  const returnCenter = (payload.returnCenterCode as string) || '';
  if (!returnCenter) {
    errors.push({ code: 'NO_RETURN_CENTER', field: 'returnCenterCode', message: '반품지 코드가 없습니다.' });
  }

  // 8. notice 검증 (items[].notices — flat 배열 형태)
  const items = (payload.items as Record<string, unknown>[]) || [];
  const firstItem = items[0] || {};
  const notices = (firstItem.notices as { noticeCategoryName: string; noticeCategoryDetailName: string; content: string }[]) || [];

  if (notices.length === 0) {
    warnings.push({
      code: 'NOTICE_EMPTY',
      field: 'items[0].notices',
      message: '고시정보가 비어있습니다. 빌더 폴백이 적용됩니다.',
    });
  }

  // 9. 필수 notice 필드가 비어있는지
  for (const notice of notices) {
    if (!notice.content || notice.content.trim() === '') {
      errors.push({
        code: 'NOTICE_FIELD_EMPTY',
        field: `notice.${notice.noticeCategoryDetailName}`,
        message: `고시정보 "${notice.noticeCategoryDetailName}" 값이 비어있습니다.`,
      });
    }
  }

  // 10. 필수 attribute 검증
  if (categoryMeta) {
    const attributes = (payload.attributes as Record<string, unknown>) || {};
    const requiredAttrs = categoryMeta.attributeMeta.filter(a => a.required);
    for (const attr of requiredAttrs) {
      const val = (attributes as Record<string, string>)[attr.attributeTypeName];
      if (!val || val.trim() === '') {
        // 빌더가 fallback 하므로 warning
        warnings.push({
          code: 'ATTR_FALLBACK',
          field: `attribute.${attr.attributeTypeName}`,
          message: `필수 속성 "${attr.attributeTypeName}" 값이 폴백 처리되었습니다.`,
        });
      } else if (attr.dataType === 'ENUM' || (attr.attributeValues && attr.attributeValues.length > 0)) {
        const allowed = attr.attributeValues?.map(v => v.attributeValueName) || [];
        if (allowed.length > 0 && !allowed.includes(val)) {
          errors.push({
            code: 'ATTR_ENUM_INVALID',
            field: `attribute.${attr.attributeTypeName}`,
            message: `속성 "${attr.attributeTypeName}" 값 "${val}"이 허용목록에 없습니다.`,
          });
        }
      }
    }
  }

  // 11. payload JSON 크기 < 5MB
  const payloadJson = JSON.stringify(payload);
  const payloadSizeKB = payloadJson.length / 1024;
  if (payloadSizeKB > 5 * 1024) {
    errors.push({ code: 'PAYLOAD_TOO_LARGE', field: 'payload', message: `페이로드 크기가 ${Math.round(payloadSizeKB)}KB입니다. (최대 5MB)` });
  }

  // 12. 이미지 신선도 (30분 TTL → 25분부터 경고)
  if (imageTimestamp) {
    const ageMs = Date.now() - imageTimestamp;
    const ageMin = ageMs / 60_000;
    if (ageMin > 25) {
      warnings.push({
        code: 'IMAGE_STALE',
        field: 'images',
        message: `이미지가 ${Math.round(ageMin)}분 전에 업로드되었습니다. 30분 초과 시 URL 만료될 수 있습니다.`,
      });
    }
  }

  // 13. 상세페이지 유무
  const contentHtml = (payload.content as string) || '';
  if (!contentHtml || contentHtml.length < 50) {
    warnings.push({ code: 'NO_DETAIL_PAGE', field: 'content', message: '상세페이지 콘텐츠가 없거나 너무 짧습니다.' });
  }

  return { errors, warnings };
}
