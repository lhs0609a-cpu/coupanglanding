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
  categoryHint?: string,
): FilledNoticeCategory[] {
  if (noticeMeta.length === 0) {
    // 메타 정보 없으면 카테고리별 폴백
    return buildFallbackNotice(product, contactNumber, categoryHint);
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
 * 메타데이터 없을 때 카테고리 힌트 기반 폴백
 * 식품/의류/화장품/가전 등 카테고리별 필수 고시 템플릿 제공
 */
function buildFallbackNotice(
  product: LocalProductJson,
  contactNumber?: string,
  categoryHint?: string,
): FilledNoticeCategory[] {
  const productName = (product.name || product.title || '').slice(0, 50);
  const brand = product.brand || '';
  const hint = (categoryHint || productName).toLowerCase();

  // 식품류
  if (/식품|건강|영양|음료|과자|라면|커피|차\b/.test(hint)) {
    return [{
      noticeCategoryName: '가공식품',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '식품의 유형', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '생산자 및 소재지', content: brand || '상세페이지 참조' },
        { noticeCategoryDetailName: '제조연월일, 유통기한 또는 품질유지기한', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '포장단위별 내용물의 용량(중량), 수량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '원재료명 및 함량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '영양성분', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '유전자변형식품 여부', content: '해당사항 없음' },
        { noticeCategoryDetailName: '소비자 안전을 위한 주의사항', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '수입식품 문구', content: '해당시 상세페이지 참조' },
        { noticeCategoryDetailName: '소비자상담 관련 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    }];
  }

  // 의류
  if (/의류|패션|셔츠|바지|티셔츠|자켓|코트|원피스|스커트/.test(hint)) {
    return [{
      noticeCategoryName: '의류',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '제품 소재', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '색상', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '치수', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: brand || '상세페이지 참조' },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '세탁방법 및 취급 시 주의사항', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조연월', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    }];
  }

  // 화장품
  if (/화장품|스킨|세럼|로션|크림|마스크팩|선크림|클렌징/.test(hint)) {
    return [{
      noticeCategoryName: '화장품',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '용량 또는 중량', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제품 주요 사양', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '사용기한 또는 개봉 후 사용기간', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '사용방법', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: brand || '상세페이지 참조' },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '화장품법에 따라 기재·표시하여야 하는 모든 성분', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '식품의약품안전처 심사 필 유무', content: '해당사항 없음' },
        { noticeCategoryDetailName: '사용할 때 주의사항', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: '소비자상담 관련 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    }];
  }

  // 가전
  if (/가전|전자|컴퓨터|노트북|모니터|냉장고|세탁기|에어컨|청소기/.test(hint)) {
    return [{
      noticeCategoryName: '소형전자',
      noticeCategoryDetailName: [
        { noticeCategoryDetailName: '품명 및 모델명', content: productName || '상세페이지 참조' },
        { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
        { noticeCategoryDetailName: '정격전압, 소비전력', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '에너지소비효율등급', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '동일모델의 출시년월', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '제조자/수입자', content: brand || '상세페이지 참조' },
        { noticeCategoryDetailName: '제조국', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '크기', content: '상세페이지 참조' },
        { noticeCategoryDetailName: '품질보증기준', content: '제조사 기준' },
        { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: contactNumber || '상세페이지 참조' },
      ],
    }];
  }

  // 기타 재화 (기존 기본값)
  return [{
    noticeCategoryName: '기타 재화',
    noticeCategoryDetailName: [
      { noticeCategoryDetailName: '품명 및 모델명', content: productName || '상세페이지 참조' },
      { noticeCategoryDetailName: '인증/허가 사항', content: '해당사항 없음' },
      { noticeCategoryDetailName: '제조국 또는 원산지', content: '상세페이지 참조' },
      { noticeCategoryDetailName: '제조자/수입자', content: brand || '상세페이지 참조' },
      { noticeCategoryDetailName: 'A/S 책임자와 전화번호', content: contactNumber || '상세페이지 참조' },
    ],
  }];
}
