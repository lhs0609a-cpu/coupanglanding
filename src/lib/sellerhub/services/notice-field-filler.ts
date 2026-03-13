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
export function fillNoticeFields(
  noticeMeta: NoticeCategoryMeta[],
  product: LocalProductJson,
  contactNumber?: string,
  overrides?: Record<string, string>,
): FilledNoticeCategory[] {
  if (noticeMeta.length === 0) {
    // 메타 정보 없으면 기본 "기타 재화" 폴백
    return buildFallbackNotice(product, contactNumber);
  }

  return noticeMeta.map((category) => ({
    noticeCategoryName: category.noticeCategoryName,
    noticeCategoryDetailName: category.fields.map((field) => ({
      noticeCategoryDetailName: field.name,
      content: resolveFieldValue(field.name, product, contactNumber, overrides),
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
): string {
  // 사용자가 수동으로 지정한 값 우선
  if (overrides?.[fieldName]) {
    return overrides[fieldName];
  }

  const normalized = fieldName.toLowerCase().replace(/\s/g, '');
  const productName = (product.name || product.title || '').slice(0, 50);
  const brand = product.brand || '';

  // 패턴 매칭 규칙
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
  if (normalized.includes('크기') || normalized.includes('중량') || normalized.includes('무게') || normalized.includes('용량')) {
    return '상세페이지 참조';
  }
  if (normalized.includes('소재') || normalized.includes('재질') || normalized.includes('성분')) {
    return '상세페이지 참조';
  }
  if (normalized.includes('색상') || normalized.includes('컬러')) {
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
