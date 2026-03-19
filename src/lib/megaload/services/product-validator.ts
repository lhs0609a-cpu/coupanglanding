/**
 * 대량 등록 사전 검증 엔진
 * - validateProductLocal(): 즉시 실행 (API 불필요)
 * - validateProductDeep(): 카테고리 메타 기반 (API 필요)
 */

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
): ProductValidationResult {
  // 먼저 로컬 검증 실행
  const localResult = validateProductLocal(product);
  const errors = [...localResult.errors];
  const warnings = [...localResult.warnings];

  // 카테고리 메타가 없으면 로컬 결과만 반환
  if (!categoryMeta) {
    return localResult;
  }

  // 필수 속성 검증
  const requiredAttributes = categoryMeta.attributeMeta.filter((a) => a.required);
  for (const attr of requiredAttributes) {
    if (!attr.attributeValues || attr.attributeValues.length === 0) {
      errors.push({
        field: 'attributes',
        severity: 'error',
        message: `필수 속성 "${attr.attributeTypeName}"의 값이 없습니다.`,
        fixSuggestion: '카테고리에서 요구하는 속성값을 설정할 수 없습니다.',
      });
    }
  }

  // A/S 연락처 확인
  const hasAsField = categoryMeta.noticeMeta.some((n) =>
    n.fields.some((f) => f.name.includes('A/S') || f.name.includes('전화번호') || f.name.includes('책임자')),
  );
  if (hasAsField && !contactNumber?.trim()) {
    warnings.push({
      field: 'contact',
      severity: 'warning',
      message: 'A/S 연락처가 필요한 카테고리인데 연락처가 미입력입니다.',
      fixSuggestion: 'Step 1에서 판매자 연락처를 입력해주세요.',
    });
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

  // notices 필수 필드
  if (categoryMeta && categoryMeta.noticeMeta.length > 0) {
    for (const notice of categoryMeta.noticeMeta) {
      for (const field of notice.fields.filter((f) => f.required)) {
        if (field.name.includes('A/S') && !product.contactNumber?.trim()) {
          missingRequiredFields.push(`고시:${notice.noticeCategoryName}/${field.name}`);
        }
      }
    }
  }

  // attributes 필수 항목 중 값이 없는 것
  if (categoryMeta) {
    for (const attr of categoryMeta.attributeMeta.filter((a) => a.required)) {
      if (!attr.attributeValues || attr.attributeValues.length === 0) {
        missingRequiredFields.push(`속성:${attr.attributeTypeName}`);
      }
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
