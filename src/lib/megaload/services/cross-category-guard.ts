// ============================================================
// 크로스카테고리 어휘 차단 가드 (런타임 안전망)
//
// 목적: 어떤 풀/attrs/path token 에서 누출된 단어든, 카테고리에
// 부적합한 단어는 최종 출력에서 강제 제거하여 노출상품명/상세페이지
// cross-pollution 을 시스템 레벨에서 차단한다.
//
// 작동 원리:
//   1. categoryPath → 카테고리 그룹 매핑 (food/beauty/electronics/...)
//   2. 각 그룹별로 절대 등장하면 안 되는 토큰 사전 정의
//   3. 출력 텍스트를 토큰화하여 forbidden 토큰만 제거
//
// 적용 위치: display-name-generator, persuasion-engine, real-review-composer
// 의 최종 출력 직전에 sanitizeCrossCategory(text, categoryPath) 호출.
// ============================================================

export type CategoryGroup =
  | 'food_fresh' | 'food_processed' | 'food_supplement' | 'food_misc'
  | 'beauty' | 'electronics' | 'fashion' | 'household'
  | 'furniture' | 'kitchen' | 'sports' | 'office' | 'toy'
  | 'baby' | 'pet' | 'automotive' | 'book' | 'unknown';

/**
 * 카테고리 path 를 그룹으로 분류 (보수적 — 모호하면 'unknown' 반환).
 */
export function classifyCategoryGroup(categoryPath: string): CategoryGroup {
  if (!categoryPath) return 'unknown';
  const path = categoryPath;
  const top = (path.split(/[>\s]/)[0] || '').trim();

  // 출산/유아동 우선 (유모차의 '차' 매칭 차단)
  if (top.startsWith('출산') || top.includes('유아동')) {
    if (path.includes('유아건강식품')) return 'food_supplement';
    if (path.includes('유아간식/음료') || path.includes('유아국/반찬') || path.includes('유아양념')
        || path.includes('유아 우유') || path.includes('유아생수') || path.includes('유아티백')) return 'food_processed';
    if (path.includes('이유식') || path.includes('분유')) return 'food_supplement';
    return 'baby';
  }

  if (top.includes('식품') || top.includes('건강식품')) {
    if (path.includes('건강식품') || path.includes('영양제') || path.includes('비타민/미네랄')
        || path.includes('비타민제') || path.endsWith('홍삼') || path.includes('홍삼>')) return 'food_supplement';
    if (path.includes('신선식품') || path.includes('과일') || path.includes('채소')
        || path.includes('축산') || path.includes('수산') || path.includes('정육')
        || path.includes('농산')) return 'food_fresh';
    if (path.includes('가공') || path.includes('즉석') || path.includes('스낵') || path.includes('간식')
        || path.includes('김치') || path.includes('반찬') || path.includes('젓갈') || path.includes('면류')
        || path.includes('소스') || path.includes('조미료') || path.includes('베이커리')
        || path.includes('유제품') || path.includes('아이스크림') || path.includes('생수')
        || path.includes('음료') || path.includes('커피') || path.includes('전통주')) return 'food_processed';
    return 'food_misc';
  }

  if (top.includes('뷰티') || top.includes('화장품')) return 'beauty';
  if (top.includes('가전') || top.includes('디지털')) return 'electronics';
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화')) return 'fashion';
  if (top.includes('가구') || top.includes('홈데코')) return 'furniture';
  if (top.includes('주방')) return 'kitchen';
  if (top.includes('생활')) return 'household';
  if (top.includes('스포츠') || top.includes('레져')) return 'sports';
  if (top.includes('자동차')) return 'automotive';
  if (top.includes('반려') || top.includes('애완')) return 'pet';
  if (top.includes('완구') || top.includes('취미')) return 'toy';
  if (top.includes('문구') || top.includes('사무')) return 'office';
  if (top.includes('도서')) return 'book';
  return 'unknown';
}

/**
 * 그룹별 절대 등장하면 안 되는 토큰 사전.
 * - 다른 카테고리의 시그니처 단어
 * - 단어 단위 매칭 (substring 매칭 X — '장식품' 의 '식품' 같은 false positive 방지)
 *
 * ⚠️ 카테고리에 자연스러운 단어는 절대 추가 금지 (예: 식품 카테고리에 '식품' 추가 X — path token 정상)
 */
// ⚠️ 영양제/보충제 시그니처 — 비식품/비뷰티 카테고리에는 절대 등장 금지
// audit-100x: 입력에 "프로틴 듬뿍" 같은 contamination 시드가 들어오면
// cleanName 마지막 토큰으로 살아남아 buildProductRefs 를 통해 본문에 누출됨.
// 이 토큰들은 health_supplement/뷰티(콜라겐/히알루론산/판테놀 등) 외에는 모두 차단.
const SUPPLEMENT_SIGNATURE_FORBIDDEN = [
  '프로틴', '단백질보충', 'WPC', 'WPI', 'BCAA', '크레아틴', '카제인', '게이너',
  '근력강화', '근육성장', '근육합성', '운동회복', '운동보충',
  '코엔자임Q10', '유비퀴놀', '코큐텐',
  '밀크씨슬', '실리마린',
  '루테인', '지아잔틴',
  '글루코사민', '콘드로이친', 'MSM', '보스웰리아',
  '쏘팔메토',
  '오메가3', 'EPA', 'DHA', '크릴오일',
  '진세노사이드', '인삼사포닌', '프로폴리스',
  '비오틴', '판토텐산',
  '가르시니아', 'HCA', 'CLA',
  '스피루리나', '클로렐라',
];

// 뷰티는 화장품 성분(히알루론산/콜라겐/엘라스틴/판테놀/아르간오일/실크프로틴 등)이 정상.
// → 뷰티용 영양제 forbidden 은 위 SUPPLEMENT_SIGNATURE 그대로 사용 (성분명은 제외됨).

// ⚠️ 식품 (신선/가공/건강식품) 공통 forbidden — 모두 차단
const FOOD_COMMON_FORBIDDEN = [
  // 가전/공산품 어휘 (식품에 부적합)
  '컴팩트', '슈퍼', '울트라', '맥스', '프로페셔널', '편리한', '고성능', '하이엔드', '하이테크',
  '내구성', '견고한', '럭셔리', '실용적', '인테리어', '디자인', '스타일리시',
  '모던한', '모던', '클래식한', '클래식', '심플한', '심플', '베이직', '트렌디', '세련된', '미니멀',
  '에코', '에코모드', '에코프렌들리', '필터', '충전', '배터리', '와트', '라이트', '슬림',
  '가정용', '사무용', '업소용',
  // 공예/공구 어휘
  '장인정신', '장인의', '핸드메이드', '수제작',
  // 뷰티 어휘
  '저자극', '비건', '약산성', '데일리', '진정', '광채', '집중', '고보습', '수분감', '탄력',
  // 자동차
  '발수', '광택', '세차', '코팅',
  // 펫
  '기호성', '소형견', '대형견', '반려동물',
  // 패션
  '레이어드', '오버핏', '슬림핏',
];

const FORBIDDEN_TOKENS: Record<CategoryGroup, Set<string>> = {
  // 신선식품 (과일/채소/축산/수산)
  food_fresh: new Set([
    // 영양제/건강식품 어휘 — 신선식품에 부적합
    '영양제', '보충제', '건강기능식품', '건강식품', '시니어', '캡슐', '정제', '알약',
    '면역', '피로회복', '다이어트',
    ...FOOD_COMMON_FORBIDDEN,
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  // 가공식품 (라면/김치/스낵/소스)
  food_processed: new Set([
    '영양제', '보충제', '건강기능식품', '건강식품', '시니어', '캡슐', '정제', '알약',
    '면역', '피로회복', '다이어트',
    ...FOOD_COMMON_FORBIDDEN,
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  // 건강식품 (비타민/홍삼/오메가3 등 영양제) — 영양제/보충제는 자연스러우니 허용, 비식품 어휘만 차단
  food_supplement: new Set([
    ...FOOD_COMMON_FORBIDDEN,
  ]),
  // 식품 기타 (DEFAULT) — 건강식품/영양제 허용 (애매한 식품 카테고리)
  food_misc: new Set([
    ...FOOD_COMMON_FORBIDDEN,
  ]),
  // 뷰티
  beauty: new Set([
    // 식품 어휘
    '식품', '식재료', '신선', '신선한', '제철', '국내산', '담백한', '깊은맛',
    '냉장', '냉동', '산지직송', '햇과일', '한우', '한돈', '햅쌀',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제',
    '면역', '피로회복', '다이어트',
    // 가전/공산품 어휘
    '컴팩트', '울트라', '맥스', '에너지효율', '저소음',
    '내구성', '견고한', '럭셔리', '인테리어',
    // 자동차/펫
    '발수코팅', '세차', '기호성', '소형견', '대형견',
    // 영양제 시그니처 (히알루론산/콜라겐/엘라스틴/판테놀/아르간오일/실크프로틴 등 화장품 성분은 제외)
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
  ]),
  // 가전/디지털
  electronics: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '국내산', '담백한',
    '냉장', '냉동', '산지직송', '햇과일', '한우', '한돈',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '데일리', '고보습',
    '발수코팅', '세차', '기호성', '소형견', '대형견',
    '신생아', '영아', '유아용', '기저귀',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  fashion: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '국내산', '담백한',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '에너지효율', '저소음', '필터', '충전', '배터리',
    '발수코팅', '세차', '기호성', '소형견', '대형견',
    '신생아', '영아', '유아용', '기저귀',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  household: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우', '한돈',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '진정', '광채', '고보습',
    '에너지효율', '필터', '충전', '배터리',
    '발수코팅', '세차',
    '기호성', '소형견', '대형견', '신생아',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  furniture: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우', '한돈',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '필터', '충전', '배터리',
    '발수코팅', '세차',
    '기호성', '소형견', '대형견', '신생아',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  kitchen: new Set([
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '발수코팅', '세차', '필터', '충전',
    '기호성', '소형견', '대형견', '신생아',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  sports: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '에너지효율', '저소음', '필터', '충전',
    '발수코팅', '세차',
    '기호성', '소형견', '대형견', '신생아', '기저귀',
    // ⚠️ 정정 (2026-05-19): 스포츠 카테고리에서도 영양 성분 전체 차단.
    // audit-100x: BCAA/프로틴/근력강화 등이 스포츠 카테고리 본문에 누출되어
    // 보충제 누출 115건 (전체 168 중 68%) 발생. 운동보충제는 health_supplement 만 자연스러움.
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  office: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '에너지효율', '저소음', '필터',
    '발수코팅', '세차',
    '기호성', '소형견', '대형견', '신생아', '기저귀',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  toy: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '에너지효율', '저소음', '필터',
    '발수코팅', '세차',
    '기호성', '소형견', '대형견',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  baby: new Set([
    '식품', '신선', '신선한', '제철', '담백한', '한우',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제',
    '에너지효율', '저소음', '필터',
    '발수코팅', '세차',
    '기호성', '소형견', '대형견',
    // 출산/유아 카테고리에 가구 어휘는 부적합
    '인테리어', '럭셔리', '견고한',
    // ⚠️ 정정 (2026-05-19): baby 카테고리도 영양제 시그니처 전체 차단.
    // 출산/유아동 일반품은 보충제와 무관 → 분유/이유식 (food_supplement 그룹) 분리.
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  pet: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '에너지효율', '저소음', '필터',
    '발수코팅', '세차',
    '인테리어', '견고한', '럭셔리',
    // pet 영양제는 별개라 인간 영양제 시그니처 전체 차단
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  automotive: new Set([
    '식품', '식재료', '신선', '신선한', '제철', '담백한', '한우',
    '영양제', '보충제', '건강기능식품', '시니어', '캡슐', '정제', '면역',
    '저자극', '비건', '약산성', '진정', '광채', '고보습',
    '필터', '충전',
    '기호성', '소형견', '대형견', '신생아', '기저귀',
    ...SUPPLEMENT_SIGNATURE_FORBIDDEN,
    '히알루론산', '콜라겐', '엘라스틴', '판테놀', '아르간오일', '실크프로틴',
  ]),
  book: new Set([
    // 도서는 어떤 주제든 책으로 다룰 수 있어 forbidden 적게 정의
    '발수코팅', '세차', '기호성',
  ]),
  unknown: new Set(),
};

/**
 * 토큰 SUBSTRING 매칭 forbidden — 컴파운드 토큰 차단용.
 * exact-match FORBIDDEN_TOKENS 로는 "판테놀" 잡지만 "판테놀을" 못 잡음 (조사 결합).
 * 이 리스트의 토큰이 입력 token 어디든 substring 으로 나타나면 그 token 전체를 드롭.
 *
 * 영양 성분/cross-cat 시그니처가 조사("을/를/이/가/은/는/도/만") 와 붙어 한 토큰으로 나타나는 케이스 차단.
 */
// 영양 성분 컴파운드 차단 (조사 결합 포함) — 비-supplement 카테고리 공통
const NUTRITION_COMPOUND = [
  '프로틴', 'BCAA', '크레아틴', '카제인', '게이너', '단백질보충',
  '근력강화', '근육성장', '근육합성', '운동회복', '운동보충',
  '코엔자임Q10', '유비퀴놀', '코큐텐',
  '밀크씨슬', '실리마린',
  '루테인', '지아잔틴',
  '글루코사민', '콘드로이친', 'MSM', '보스웰리아', '쏘팔메토',
  '오메가3', 'EPA', 'DHA', '크릴오일',
  '진세노사이드', '인삼사포닌', '프로폴리스',
  '비오틴', '판토텐산',
  '판테놀', '아르간오일', '실크프로틴',
  '가르시니아', 'HCA', 'CLA',
  '스피루리나', '클로렐라',
];
// 도메인 시그니처 컴파운드 — 다른 카테고리에서 등장 시 부적절
const DOMAIN_COMPOUND = [
  '김치', '한우', '한돈', '노트북', '세탁기', '냉장고', '모니터',
  '강아지', '고양이', '반려동물', '댕댕이', '캣맘',
  '오토캠핑', '캠핑카',
];
// 화장품 성분 컴파운드 — 비-뷰티/비-supplement 카테고리에서 차단
const COSMETIC_COMPOUND = ['히알루론산', '콜라겐', '엘라스틴'];

const SUBSTRING_FORBIDDEN: Record<CategoryGroup, string[]> = {
  food_fresh: [...NUTRITION_COMPOUND, ...COSMETIC_COMPOUND],
  food_processed: [...NUTRITION_COMPOUND, ...COSMETIC_COMPOUND],
  food_supplement: [],
  food_misc: [],
  // 뷰티는 화장품 성분 허용 (히알루론산/콜라겐 등) — 운동보충제만 차단
  beauty: [...NUTRITION_COMPOUND.filter(t => !['판테놀','아르간오일','실크프로틴'].includes(t)), ...DOMAIN_COMPOUND],
  electronics: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  fashion: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  household: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  furniture: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  kitchen: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND.filter(t => t !== '김치' && t !== '한우' && t !== '한돈'), ...COSMETIC_COMPOUND],
  sports: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  office: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  toy: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  baby: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  pet: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND.filter(t => !['강아지','고양이','반려동물','댕댕이','캣맘'].includes(t)), ...COSMETIC_COMPOUND],
  automotive: [...NUTRITION_COMPOUND, ...DOMAIN_COMPOUND, ...COSMETIC_COMPOUND],
  book: [],
  unknown: [],
};

/**
 * 텍스트에서 카테고리 부적합 토큰만 제거하여 반환.
 * 토큰 단위 매칭(공백/슬래시/구두점 분리) — substring false positive 차단.
 *
 * @param text 검사할 텍스트
 * @param categoryPath 쿠팡 카테고리 경로
 * @returns sanitize 된 텍스트 (forbidden 토큰 제거)
 */
export function sanitizeCrossCategory(text: string, categoryPath: string): string {
  if (!text || !categoryPath) return text;
  const group = classifyCategoryGroup(categoryPath);
  const forbidden = FORBIDDEN_TOKENS[group];
  const substrForbidden = SUBSTRING_FORBIDDEN[group] || [];
  if ((!forbidden || forbidden.size === 0) && substrForbidden.length === 0) return text;

  // ⚠️ leaf-token 보호: substring 매칭이 leaf 자신(예: "모니터받침대" 안의 "모니터")까지
  // 잘라내면 정체성 붕괴 발생. leaf 와 path 토큰은 무조건 통과.
  const pathLower = categoryPath.toLowerCase();
  const leafSegment = (categoryPath.split('>').pop() || '').toLowerCase();
  const protectedTokens = new Set<string>();
  for (const t of leafSegment.split(/[\s/(),\[\]\-_]+/).filter(Boolean)) protectedTokens.add(t);
  for (const t of pathLower.split(/[\s>/(),\[\]\-_]+/).filter(Boolean)) protectedTokens.add(t);

  // 토큰 단위 분리. 공백/탭/슬래시로 나누고 각 토큰의 head/tail 구두점 보존.
  // (구두점 보존은 노출명/문장 형태 유지용 — 단어 자체만 비교)
  return text.split(/(\s+|[/])/g).map(part => {
    if (/^\s+$/.test(part) || part === '/') return part;
    const m = part.match(/^([^\w가-힣]*)(.*?)([^\w가-힣]*)$/);
    if (!m) return part;
    const [, , word] = m;
    const wordLower = word.toLowerCase();
    // leaf/path 토큰이거나 leaf 가 word를 substring 으로 포함하면 보존 (모니터받침대 → 모니터 보호)
    if (protectedTokens.has(wordLower)) return part;
    if (leafSegment.includes(wordLower) && wordLower.length >= 2) return part;
    if (forbidden && forbidden.has(word)) return ''; // exact-token forbidden — 제거
    // 컴파운드 토큰 ("김치맛","노트북호환","강아지용") 차단 — substring 매칭
    if (substrForbidden.length > 0) {
      for (const sf of substrForbidden) {
        // 단, forbidden substring 이 path/leaf 안에 들어 있으면(예: "모니터받침대" 카테고리 안의 "모니터") 보호
        if (pathLower.includes(sf.toLowerCase())) continue;
        if (word.includes(sf)) return ''; // 컴파운드 안에 forbidden substring 포함 → token 전체 드롭
      }
    }
    return part;
  }).join('').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 디버그용 — 텍스트에서 발견된 forbidden 토큰 목록 반환.
 */
export function detectCrossCategory(text: string, categoryPath: string): string[] {
  if (!text || !categoryPath) return [];
  const group = classifyCategoryGroup(categoryPath);
  const forbidden = FORBIDDEN_TOKENS[group];
  if (!forbidden || forbidden.size === 0) return [];

  const detected: string[] = [];
  const tokens = text.split(/[\s/]+/).map(t => t.replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, ''));
  for (const t of tokens) {
    if (forbidden.has(t)) detected.push(t);
  }
  return detected;
}
