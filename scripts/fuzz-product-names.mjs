// Fuzz product name generator — 카테고리별로 현실적인 다양한 상품명 변형 생성
//
// 변형 차원:
//   - prefix: 브랜드/형용사/형태 토큰 (40+ 종)
//   - infix: 카테고리 leaf
//   - spec: 단위/수량/사이즈/색상 조합 (50+ 변형)
//   - noise: 특수문자/한자/빈공간/오타 (15+ 변형)
//   - length: 짧음(15자) / 중간(40자) / 김(100자) / 매우김(150자, 트리밍 테스트)

export const PREFIX_POOL = [
  // 형용사
  '프리미엄', '슈퍼', '하이', '고급', '특급', '엘리트', '럭셔리', '디럭스',
  '미니', '컴팩트', '대형', '특대형', '점보', '슬림', '울트라',
  '신선한', '진한', '풍부한', '담백한', '쫀득한', '바삭한', '부드러운',
  // 기능형
  '저칼로리', '저당', '무가당', '무첨가', '유기농', '친환경', '국내산',
  '수입', '직수입', '직배송', '당일발송', '신상품', '한정판', '특가',
  // 브랜드 풍
  '메가로드', '쿠팡베스트', '셀러스픽', '핫딜', '국민템', 'MD추천',
];

export const NOISE_TOKENS = [
  '', '', '', '',  // 50% 확률 노이즈 없음
  ' ', '  ', ',', '.',
  '★', '☆', '※', '◆',
  '(특가)', '[추천]', '《인기》', '<신상>',
  '★★★', '◎◎◎',
  // 한자/일본 혼용
  '한국産', '日本産', '中國産',
  // 공백 다중
  '   ', '\t', '  - ',
];

export const SPEC_POOL = [
  // 단위형 (numeric + unit)
  '500g', '1kg', '1.5kg', '2kg', '5kg', '10kg', '17kg', '100g', '250g',
  '50ml', '100ml', '200ml', '250ml', '350ml', '500ml', '1L', '1.5L', '2L',
  '1cm', '5cm', '10cm', '30cm', '50cm', '100cm', '1m', '2m',
  // 수량형
  '1개', '2개', '3개', '5개', '10개', '20개', '30개', '50개', '100개',
  '1박스', '3박스', '5박스', '1세트', '3세트', '1팩', '3팩', '5팩',
  '1통', '3통', '6통', '12통', '1병', '6병', '12병',
  // 정/캡슐/포
  '30정', '60정', '90정', '120정', '180정', '60캡슐', '120캡슐', '180캡슐',
  '30포', '60포', '90포', '30개입', '50개입', '100개입',
  // 복합
  '500g x 2개', '250ml x 24개', '80매 x 10팩', '30포 x 3박스',
  '1kg, 3개', '500ml, 2개입', '60정 2통', '90캡슐 3통',
  // 사이즈/색상
  '블랙 L', '화이트 M', '레드 XL', '핑크 FREE', '네이비 100', '베이지 235',
];

export const SUFFIX_POOL = [
  '', '', '', '',  // 50% no suffix
  '신상', '인기상품', '추천템', '베스트셀러', '리뷰만점',
  '당일배송', '무료배송', '로켓배송', '특가할인',
];

/**
 * 카테고리에 맞는 fuzz product name 생성
 */
export function generateFuzzNames(leaf, count = 30) {
  const names = [];
  const seedBase = leaf.charCodeAt(0) * 31 + leaf.length;

  // 결정론적이지 않은 다양화를 위해 모든 차원 변형
  for (let i = 0; i < count; i++) {
    const seed = (seedBase + i * 7919) % 99991;
    const usePrefix = (seed % 4) !== 0;
    const useSpec = (seed % 3) !== 0;
    const useSuffix = (seed % 5) !== 0;
    const useNoise = (seed % 8) === 0;

    const parts = [];
    if (usePrefix) parts.push(PREFIX_POOL[seed % PREFIX_POOL.length]);
    if (useNoise) parts.push(NOISE_TOKENS[(seed * 13) % NOISE_TOKENS.length]);
    parts.push(leaf);
    if (useSpec) parts.push(SPEC_POOL[(seed * 17) % SPEC_POOL.length]);
    if (useSuffix) parts.push(SUFFIX_POOL[(seed * 19) % SUFFIX_POOL.length]);

    let name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    // 길이 변형: 일부 매우 짧고 일부 매우 김
    if (i % 13 === 0) name = leaf;  // 가장 짧음 (leaf 만)
    if (i % 17 === 0) name = `${name} ${name} ${name}`.slice(0, 200);  // 매우 김

    if (!name) name = leaf;
    names.push(name);
  }
  return names;
}

// Edge case 패턴 (모든 cat 에 공통 적용)
export const EDGE_CASE_PATTERNS = [
  '',                       // 빈 문자열 (extractor 가 leaf fallback 해야 함)
  '?',                      // 특수문자만
  '1234567890',             // 숫자만
  '한글한글한글한글한글한글한글',  // 단어 반복
  'ABCDEFGHIJabcdefghij',   // 영문만
  '   ',                    // 공백만
];
