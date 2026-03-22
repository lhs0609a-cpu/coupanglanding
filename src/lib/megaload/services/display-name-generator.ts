// ============================================================
// 노출상품명(displayProductName) SEO 최적화 생성기
//
// 핵심 원리:
// 1. 상품명에서 실제 검색 키워드 추출
// 2. 카테고리별 연관 검색어 추가
// 3. 동의어 치환으로 변형
// 4. 순서 셔플로 아이템 위너 방지
//
// 모든 단어가 "사람들이 실제로 검색하는 키워드"
// → 쿠팡 SEO 최적화 + 아이템 위너 방지 동시 달성
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import seoData from '../data/seo-keyword-pools.json';

// ─── 데이터 ──────────────────────────────────────────────────

const KEYWORD_POOLS: Record<string, string[]> = seoData.keywords;
const SYNONYM_GROUPS: Record<string, string[]> = seoData.synonymGroups;

// ─── 상품명 파서 ─────────────────────────────────────────────

const SPEC_PATTERN = /\d+\s*(ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

const NOISE = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '추천', '인기', '베스트', '상품상세참조', '프리미엄', '고함량', '저분자',
  '대용량', '국내', '해외', '순수', '천연', '식물성',
]);

function extractKeywords(name: string): { specs: string[]; words: string[] } {
  // 괄호 제거
  let cleaned = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  // 스펙 추출
  const specs: string[] = [];
  const specMatches = cleaned.match(SPEC_PATTERN);
  if (specMatches) specs.push(...specMatches.map(s => s.trim()));

  // 단어 추출 (스펙 제거, 중복 제거)
  const withoutSpecs = cleaned.replace(SPEC_PATTERN, ' ');
  const seen = new Set<string>();
  const words = withoutSpecs
    .split(/\s+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => {
      if (w.length < 2) return false;
      if (NOISE.has(w)) return false;
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });

  // 갯수 정보가 없으면 "1개" 기본 추가
  const hasCount = specs.some(s => /\d+\s*(개|입|매|팩|세트|병|통|포|봉|장|알|ea)$/i.test(s));
  if (!hasCount) specs.push('1개');

  return { specs: specs.slice(0, 3), words };
}

// ─── 카테고리 매칭 ───────────────────────────────────────────

function findBestPool(categoryPath: string): string[] {
  // 정확 매칭
  if (KEYWORD_POOLS[categoryPath]) return KEYWORD_POOLS[categoryPath];

  // 부분 매칭 (가장 긴 매칭)
  let bestKey = '';
  let bestLen = 0;
  for (const key of Object.keys(KEYWORD_POOLS)) {
    if (categoryPath.includes(key) || key.includes(categoryPath.split('>').slice(0, 3).join('>'))) {
      if (key.length > bestLen) {
        bestLen = key.length;
        bestKey = key;
      }
    }
  }
  if (bestKey) return KEYWORD_POOLS[bestKey];

  // 대분류 매칭
  const top = categoryPath.split('>')[0];
  for (const key of Object.keys(KEYWORD_POOLS)) {
    if (key.startsWith(top)) return KEYWORD_POOLS[key];
  }

  return [];
}

// ─── 동의어 치환 ─────────────────────────────────────────────

function applySynonym(word: string, rng: () => number): string {
  for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    if (synonyms.some(s => s.toLowerCase() === word.toLowerCase())) {
      // 동의어 그룹에서 랜덤 하나 선택
      return synonyms[Math.floor(rng() * synonyms.length)];
    }
  }
  return word;
}

// ─── 공개 API ────────────────────────────────────────────────

/**
 * 쿠팡 SEO 최적화 노출상품명 생성
 *
 * 구조: [핵심키워드] [연관검색어1] [연관검색어2] [브랜드] [스펙]
 * 모든 단어가 실제 검색되는 키워드.
 * 셀러마다 순서+동의어가 다름 → 아이템 위너 방지.
 */
export function generateDisplayName(
  originalName: string,
  brand: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): string {
  const { specs, words } = extractKeywords(originalName);

  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);

  // 카테고리 연관 검색어 풀
  const catKeywords = findBestPool(categoryPath);

  // 1. 상품명에서 추출한 핵심 키워드 (브랜드명 제외, 최대 7개)
  const brandLower = brand.toLowerCase();
  const coreWords = words
    .filter(w => w.toLowerCase() !== brandLower && !brandLower.includes(w.toLowerCase()))
    .slice(0, 7);

  // 2. 핵심 키워드의 동의어만 추가 (상품과 무관한 키워드 절대 추가 안 함)
  //    "넥크림" → "목주름크림", "넥라인크림" (같은 제품의 다른 표현)
  //    "콜라겐" → "저분자콜라겐", "피쉬콜라겐" (같은 성분의 다른 표현)
  const relatedWords: string[] = [];
  for (const w of coreWords) {
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === w.toLowerCase())) {
        // 이 키워드의 동의어 중 원본과 다른 것 1~2개 추가
        const others = synonyms.filter(s => s.toLowerCase() !== w.toLowerCase());
        const pickCount = Math.min(others.length, 1 + Math.floor(rng() * 2)); // 1~2개
        const shuffledOthers = [...others].sort(() => rng() - 0.5);
        for (let k = 0; k < pickCount; k++) {
          relatedWords.push(shuffledOthers[k]);
        }
        break;
      }
    }
  }

  // 3. 카테고리 풀에서 이 상품과 직접 관련된 키워드만 추가
  //    (상품명 단어가 카테고리 풀에도 존재하는 경우만)
  const coreSet = new Set(coreWords.map(w => w.toLowerCase()));
  const relatedSet = new Set(relatedWords.map(w => w.toLowerCase()));
  const catRelated = catKeywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    if (coreSet.has(kwLower) || relatedSet.has(kwLower)) return false;
    // 상품명 핵심 키워드와 글자가 2자 이상 겹치는 것만
    for (const core of coreWords) {
      if (core.length >= 2 && (kwLower.includes(core) || core.includes(kwLower))) return true;
    }
    return false;
  });
  const shuffledCatRelated = [...catRelated].sort(() => rng() - 0.5);
  relatedWords.push(...shuffledCatRelated.slice(0, 2 + Math.floor(rng() * 2))); // 2~3개

  // 4. 전체 키워드 조합
  const allWords: string[] = [];

  // 핵심 키워드 (일부 동의어 치환)
  for (const w of coreWords) {
    // 50% 확률로 동의어 치환 (나머지 50%는 원본 유지)
    if (rng() > 0.5) {
      allWords.push(applySynonym(w, rng));
    } else {
      allWords.push(w);
    }
  }

  // 동의어 기반 연관 키워드
  for (const w of relatedWords) {
    allWords.push(w);
  }

  // 브랜드는 넣지 않음 — 아이템 위너 묶임 방지
  // (브랜드 필드에는 별도로 들어가므로 노출상품명에서 제외)

  // 스펙(용량/갯수)은 반드시 포함 — 검색에도 중요하고 구매 결정에도 필수
  for (const s of specs) {
    allWords.push(s);
  }

  // 4. 중복 제거
  const seen = new Set<string>();
  const unique = allWords.filter(w => {
    const l = w.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  // 5. 순서 셔플 (시드 기반 — 셀러마다 다른 순서)
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }

  // 6. 100자 제한
  let result = unique.join(' ');
  if (result.length > 100) {
    const trimmed: string[] = [];
    let len = 0;
    for (const w of unique) {
      if (len + w.length + 1 > 100) break;
      trimmed.push(w);
      len += w.length + 1;
    }
    result = trimmed.join(' ');
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
