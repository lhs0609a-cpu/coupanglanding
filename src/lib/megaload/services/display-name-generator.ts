// ============================================================
// 노출상품명(displayProductName) 랜덤 템플릿 생성기
//
// 아이템 위너 방지: 같은 상품이라도 셀러마다 다른 노출상품명.
// 쿠팡 SEO 최적화: 카테고리별 검색 키워드 + 형용사 조합.
// AI 없이 로컬에서 즉시 생성, 결정적 (같은 시드 → 같은 결과).
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

// ─── 카테고리별 형용사/수식어 풀 ─────────────────────────────

const ADJECTIVE_POOL: Record<string, string[]> = {
  '뷰티': ['촉촉한', '매끈한', '산뜻한', '순한', '부드러운', '고보습', '저자극', '깊은', '맑은', '윤기나는', '건강한', '탱탱한', '매끄러운', '순수한', '진한'],
  '식품': ['신선한', '맛있는', '건강한', '프리미엄', '고품질', '순수한', '국내산', '엄선된', '진한', '풍부한', '달콤한', '고소한', '담백한', '깨끗한', '자연산'],
  '생활용품': ['편리한', '실용적인', '튼튼한', '대용량', '초강력', '안전한', '친환경', '고급', '멀티', '스마트', '깔끔한', '위생적인', '내구성', '강력한', '효과적인'],
  '가전/디지털': ['고성능', '초슬림', '스마트', '프리미엄', '저소음', '에너지절약', '대용량', '초고속', '무선', '휴대용', '다기능', '최신형', '고화질', '경량', '콤팩트'],
  '패션의류잡화': ['세련된', '고급스러운', '캐주얼', '편안한', '유니크한', '트렌디', '클래식', '심플한', '모던한', '데일리', '사계절', '슬림핏', '베이직', '프리미엄', '내추럴'],
  '가구/홈데코': ['모던한', '내추럴', '깔끔한', '고급', '심플한', '미니멀', '북유럽풍', '실용적인', '튼튼한', '클래식', '빈티지', '우드', '아늑한', '편안한', '세련된'],
  '출산/유아동': ['안전한', '순한', '부드러운', '무독성', '친환경', '유기농', '저자극', '프리미엄', '건강한', '귀여운', '편안한', '가벼운', '방수', '세탁가능', '통기성'],
  '스포츠/레져': ['프로급', '가벼운', '튼튼한', '방수', '통기성', '고탄력', '경량', '프리미엄', '내구성', '안전한', '미끄럼방지', '쿠셔닝', '편안한', '다기능', '고성능'],
  '반려/애완용품': ['건강한', '맛있는', '안전한', '순한', '프리미엄', '자연산', '무첨가', '영양만점', '신선한', '편안한', '튼튼한', '부드러운', '저알러지', '유기농', '국내산'],
  '주방용품': ['튼튼한', '편리한', '위생적인', '내열', '고급', '스텐레스', '논스틱', '대용량', '경량', '다용도', '인덕션', '식기세척기', '프리미엄', '안전한', '내구성'],
  '문구/오피스': ['깔끔한', '고급', '실용적인', '심플한', '편리한', '다용도', '프리미엄', '세련된', '컬러풀', '슬림', '휴대용', '친환경', '깨끗한', '부드러운', '정밀한'],
  '도서': ['베스트셀러', '신간', '화제의', '필독', '인기', '추천', '개정판', '완전판', '최신', '핵심'],
  '완구/취미': ['재미있는', '교육적인', '안전한', '창의적인', '프리미엄', '정품', '고급', '한정판', '인기', '컬렉터', '튼튼한', '다양한', '무독성', '친환경', '컬러풀'],
  '자동차용품': ['고성능', '프리미엄', '내구성', '튼튼한', '방수', '만능', '초강력', '안전한', '고급', '간편한', '다용도', 'UV차단', '광택', '세차', '초미세먼지'],
};

// ─── 카테고리별 효능/특징 키워드 ─────────────────────────────

const FEATURE_POOL: Record<string, string[]> = {
  '뷰티': ['수분충전', '주름개선', '탄력강화', '미백효과', '영양공급', '피부결정리', '진정효과', '보습지속', '탄력케어', '피부보호', '안티에이징', '톤업', '모공케어', '각질관리', '피부장벽'],
  '식품': ['건강관리', '영양보충', '활력충전', '면역강화', '에너지업', '피로회복', '체력관리', '균형영양', '맛보장', '신선배송', '무방부제', '무색소', '무설탕', 'HACCP인증', 'GMP인증'],
  '생활용품': ['세균제거', '강력세정', '오래가는', '간편사용', '다용도', '냄새제거', '무독성', '자동', '절약형', '리필가능', '항균', '살균', '탈취', '방수', '내열'],
  '가전/디지털': ['빠른충전', '긴배터리', '터치스크린', '자동세척', '원터치', '무소음', 'AI지원', '블루투스', 'WiFi연결', '스마트앱', '에코모드', '타이머', '자동절전', '리모컨', '고효율'],
};

// ─── 템플릿 패턴 ─────────────────────────────────────────────

type TemplateSlot = 'adj' | 'brand' | 'type' | 'spec' | 'kw' | 'feat';

const TEMPLATES: TemplateSlot[][] = [
  ['adj', 'brand', 'type', 'spec', 'feat'],           // 촉촉한 브랜드 넥크림 200ml 수분충전
  ['brand', 'adj', 'type', 'spec', 'kw'],              // 브랜드 촉촉한 넥크림 200ml 넥케어
  ['type', 'spec', 'brand', 'adj', 'feat'],             // 넥크림 200ml 브랜드 촉촉한 수분충전
  ['adj', 'type', 'spec', 'kw', 'brand'],               // 촉촉한 넥크림 200ml 넥케어 브랜드
  ['brand', 'type', 'adj', 'feat', 'spec'],             // 브랜드 넥크림 촉촉한 수분충전 200ml
  ['kw', 'adj', 'brand', 'type', 'spec'],               // 넥케어 촉촉한 브랜드 넥크림 200ml
  ['adj', 'kw', 'type', 'brand', 'spec'],               // 촉촉한 넥케어 넥크림 브랜드 200ml
  ['spec', 'brand', 'adj', 'type', 'feat'],             // 200ml 브랜드 촉촉한 넥크림 수분충전
];

// ─── 상품명 파서 ─────────────────────────────────────────────

interface ParsedName {
  brand: string;
  productType: string;
  specs: string[];
  keywords: string[];
}

const SPEC_PATTERN = /\d+\s*(ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

const NOISE_WORDS = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '국내', '해외', '추천', '인기', '베스트', '상품상세참조',
]);

function parseName(originalName: string, brand: string): ParsedName {
  // 괄호 제거
  let cleaned = originalName.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  // 특수문자 제거
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  // spec 추출
  const specs: string[] = [];
  const specMatches = cleaned.match(SPEC_PATTERN);
  if (specMatches) specs.push(...specMatches.map(s => s.trim()));

  // spec 제거한 나머지
  const withoutSpecs = cleaned.replace(SPEC_PATTERN, ' ');
  const words = withoutSpecs.split(/\s+/).filter(w => w.length >= 2 && !NOISE_WORDS.has(w.toLowerCase()));

  // 브랜드 제거
  const brandLower = brand.toLowerCase();
  const filtered = words.filter(w => w.toLowerCase() !== brandLower);

  // 중복 제거
  const seen = new Set<string>();
  const unique = filtered.filter(w => {
    const l = w.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  // 첫 번째 단어를 productType으로, 나머지를 keywords로
  const productType = unique[0] || '';
  const keywords = unique.slice(1);

  return { brand: brand || '', productType, specs: specs.slice(0, 2), keywords };
}

// ─── 카테고리 대분류 추출 ────────────────────────────────────

function getCategoryTop(categoryPath: string): string {
  const top = categoryPath.split('>')[0]?.trim() || '';
  // 풀에 있는 키로 매핑
  for (const key of Object.keys(ADJECTIVE_POOL)) {
    if (top === key || top.includes(key.split('/')[0])) return key;
  }
  return '생활용품'; // 기본값
}

// ─── 공개 API ────────────────────────────────────────────────

/**
 * 랜덤 노출상품명 생성
 * @param originalName 원본 상품명
 * @param brand 브랜드
 * @param categoryPath 쿠팡 카테고리 경로
 * @param sellerSeed 셀러 고유 시드 (같은 시드 → 같은 결과)
 * @param productIndex 상품 인덱스 (배치 내 순번)
 */
export function generateDisplayName(
  originalName: string,
  brand: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): string {
  const parsed = parseName(originalName, brand);
  const catTop = getCategoryTop(categoryPath);
  const adjectives = ADJECTIVE_POOL[catTop] || ADJECTIVE_POOL['생활용품'];
  const features = FEATURE_POOL[catTop] || FEATURE_POOL['생활용품'] || [];

  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);

  // 템플릿 선택
  const template = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];

  // 각 슬롯에 대한 값 선택
  const adj = adjectives[Math.floor(rng() * adjectives.length)];
  const feat = features.length > 0 ? features[Math.floor(rng() * features.length)] : '';
  const kw = parsed.keywords.length > 0 ? parsed.keywords[Math.floor(rng() * parsed.keywords.length)] : '';

  // 템플릿 조합
  const parts: string[] = [];
  for (const slot of template) {
    switch (slot) {
      case 'adj': if (adj) parts.push(adj); break;
      case 'brand': if (parsed.brand) parts.push(parsed.brand); break;
      case 'type': if (parsed.productType) parts.push(parsed.productType); break;
      case 'spec': if (parsed.specs.length > 0) parts.push(parsed.specs.join(' ')); break;
      case 'kw': if (kw) parts.push(kw); break;
      case 'feat': if (feat) parts.push(feat); break;
    }
  }

  // 빈 슬롯 제거 + 중복 제거 + 100자 제한
  const seen = new Set<string>();
  const deduplicated = parts.filter(p => {
    const l = p.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  let result = deduplicated.join(' ').trim();

  // 100자 초과 시 마지막 단어부터 제거
  while (result.length > 100 && deduplicated.length > 2) {
    deduplicated.pop();
    result = deduplicated.join(' ').trim();
  }

  return result || originalName.slice(0, 100);
}

/**
 * 배치 노출상품명 생성
 */
export function generateDisplayNameBatch(
  products: { originalName: string; brand: string; categoryPath: string }[],
  sellerSeed: string,
): string[] {
  return products.map((p, i) => generateDisplayName(p.originalName, p.brand, p.categoryPath, sellerSeed, i));
}
