// ============================================================
// 상품정보제공고시(notices) 필드 자동채움
// 규칙기반 + 안전한 기본값 ("상세페이지 참조")
// ============================================================

import type { LocalProductJson } from './local-product-reader';

export interface NoticeFieldMeta {
  name: string;
  required: boolean;
}

export interface NoticeCategoryMeta {
  noticeCategoryName: string;
  fields: NoticeFieldMeta[];
}

export interface FilledNoticeCategory {
  noticeCategoryName: string;
  noticeCategoryDetailName: { noticeCategoryDetailName: string; content: string }[];
}

/**
 * 카테고리별 notices 메타데이터와 상품 정보를 조합하여 필드를 자동 채운다.
 *
 * 규칙:
 * 1. 패턴 매칭으로 알려진 필드 자동 입력
 * 2. 나머지는 "상세페이지 참조" (쿠팡이 대부분 허용)
 */
/** 옵션 추출 결과 (option-extractor에서 전달) */
export interface ExtractedNoticeHints {
  volume?: string;    // "50ml"
  weight?: string;    // "500g"
  color?: string;     // "블랙"
  size?: string;      // "M"
  count?: string;     // "3개"
  material?: string;  // 소재 (향후 확장)
}

export function fillNoticeFields(
  noticeMeta: NoticeCategoryMeta[],
  product: LocalProductJson,
  contactNumber?: string,
  overrides?: Record<string, string>,
  extractedHints?: ExtractedNoticeHints,
): FilledNoticeCategory[] {
  if (noticeMeta.length === 0) {
    // 메타 정보 없으면 기본 "기타 재화" 폴백
    return buildFallbackNotice(product, contactNumber);
  }

  return noticeMeta.map((category) => ({
    noticeCategoryName: category.noticeCategoryName,
    noticeCategoryDetailName: category.fields.map((field) => ({
      noticeCategoryDetailName: field.name,
      content: resolveFieldValue(field.name, product, contactNumber, overrides, extractedHints),
    })),
  }));
}

/**
 * 필드명 패턴으로 적절한 값을 매칭
 */
function resolveFieldValue(
  fieldName: string,
  product: LocalProductJson,
  contactNumber?: string,
  overrides?: Record<string, string>,
  hints?: ExtractedNoticeHints,
): string {
  // 사용자가 수동으로 지정한 값 우선
  if (overrides?.[fieldName]) {
    return overrides[fieldName];
  }

  const normalized = fieldName.toLowerCase().replace(/\s/g, '');
  const productName = (product.name || product.title || '').slice(0, 50);
  const brand = product.brand || '';

  // 패턴 매칭 규칙 (추출된 옵션값 hints 활용)
  if (normalized.includes('품명') || normalized.includes('모델명')) {
    return productName || '상세페이지 참조';
  }
  if (normalized.includes('브랜드') || normalized.includes('상호')) {
    return brand || '상세페이지 참조';
  }
  if (normalized.includes('제조국') || normalized.includes('원산지')) {
    return '상세페이지 참조';
  }
  if (normalized.includes('제조자') || normalized.includes('수입자') || normalized.includes('제조업자')) {
    return brand || '상세페이지 참조';
  }
  if (normalized.includes('a/s') || normalized.includes('as') || normalized.includes('책임자') || normalized.includes('전화번호')) {
    return contactNumber || '상세페이지 참조';
  }
  if (normalized.includes('인증') || normalized.includes('허가')) {
    return '해당사항 없음';
  }
  // 크기/중량/용량: 추출된 값이 있으면 우선 사용
  if (normalized.includes('용량') || normalized.includes('내용량')) {
    if (hints?.volume) return hints.volume;
    return '상세페이지 참조';
  }
  if (normalized.includes('중량') || normalized.includes('무게') || normalized.includes('순중량')) {
    if (hints?.weight) return hints.weight;
    return '상세페이지 참조';
  }
  if (normalized.includes('크기') || normalized.includes('치수')) {
    if (hints?.size) return hints.size;
    return '상세페이지 참조';
  }
  if (normalized.includes('색상') || normalized.includes('컬러')) {
    if (hints?.color) return hints.color;
    return '상세페이지 참조';
  }
  if (normalized.includes('수량') || normalized.includes('구성')) {
    if (hints?.count) return hints.count;
    return '상세페이지 참조';
  }
  if (normalized.includes('소재') || normalized.includes('재질') || normalized.includes('성분')) {
    if (hints?.material) return hints.material;
    return '상세페이지 참조';
  }
  if (normalized.includes('주의사항') || normalized.includes('취급')) {
    return '상세페이지 참조';
  }
  if (normalized.includes('품질보증') || normalized.includes('보증기간')) {
    return '제조사 기준';
  }
  if (normalized.includes('제조연월') || normalized.includes('생산일') || normalized.includes('날짜')) {
    return '상세페이지 참조';
  }

  // 기본값: 안전한 "상세페이지 참조"
  return '상세페이지 참조';
}

/**
 * 메타데이터 없을 때 기본 "기타 재화" 폴백
 */
function buildFallbackNotice(
  product: LocalProductJson,
  contactNumber?: string,
): FilledNoticeCategory[] {
  const productName = (product.name || product.title || '').slice(0, 50);
  const brand = product.brand || '';

  return [
    {
      noticeCategoryName: '기타 재화',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: productName || '상세페이지 참조' },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: brand || '상세페이지 참조' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    },
  ];
}
