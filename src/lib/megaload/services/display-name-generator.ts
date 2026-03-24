// ============================================================
// 노출상품명(displayProductName) SEO 최적화 생성기 v2
//
// 핵심 원리:
// 1. 상품명에서 핵심 키워드 추출
// 2. 모든 핵심 키워드를 동의어로 100% 치환
// 3. 카테고리 풀에서 셀러별 다른 서브셋 선택
// 4. 순서 셔플로 아이템 위너 방지
//
// v2 변경점:
// - 50% 확률 치환 → 100% 치환 (원본 키워드 사용 안 함)
// - 카테고리 키워드 서브셋을 셀러 시드로 분리 (겹침 최소화)
// - 연관 키워드 추가량 확대 (2~3개 → 4~6개)
// - 글자 겹침 조건 완화하여 더 다양한 키워드 포함
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
  let cleaned = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  const specs: string[] = [];
  const specMatches = cleaned.match(SPEC_PATTERN);
  if (specMatches) {
    const specSeen = new Set<string>();
    for (const s of specMatches) {
      const trimmed = s.trim();
      const key = trimmed.toLowerCase();
      if (!specSeen.has(key)) { specSeen.add(key); specs.push(trimmed); }
    }
  }

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

  const hasCount = specs.some(s => /\d+\s*(개|입|매|팩|세트|병|통|포|봉|장|알|ea)$/i.test(s));
  if (!hasCount) specs.push('1개');

  return { specs: specs.slice(0, 3), words };
}

// ─── 카테고리 매칭 ───────────────────────────────────────────

function findBestPool(categoryPath: string): string[] {
  if (KEYWORD_POOLS[categoryPath]) return KEYWORD_POOLS[categoryPath];

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

  const top = categoryPath.split('>')[0];
  for (const key of Object.keys(KEYWORD_POOLS)) {
    if (key.startsWith(top)) return KEYWORD_POOLS[key];
  }

  return [];
}

// ─── 동의어 치환 (100% — 반드시 다른 단어로) ─────────────────

function applySynonymForced(word: string, rng: () => number): string {
  for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    if (synonyms.some(s => s.toLowerCase() === word.toLowerCase())) {
      // 원본을 제외한 동의어 중에서 선택
      const others = synonyms.filter(s => s.toLowerCase() !== word.toLowerCase());
      if (others.length > 0) {
        return others[Math.floor(rng() * others.length)];
      }
      // 동의어가 원본뿐이면 그대로
      return word;
    }
  }
  return word;
}

// ─── 셀러별 서브셋 선택 (겹침 최소화) ────────────────────────

function selectSubset<T>(items: T[], count: number, rng: () => number): T[] {
  if (items.length <= count) return [...items];
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ─── 공개 API ────────────────────────────────────────────────

/**
 * 쿠팡 SEO 최적화 노출상품명 생성 v2
 *
 * 핵심 변경:
 * - 모든 핵심 키워드를 동의어로 100% 치환 (원본 단어 사용 안 함)
 * - 카테고리 풀에서 셀러마다 다른 서브셋 선택
 * - 연관 키워드 4~6개로 확대
 * - 셀러별로 완전히 다른 상품명 생성
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

  // 2. 핵심 키워드 100% 동의어 치환 (원본 단어 사용 안 함)
  const transformedCore: string[] = [];
  for (const w of coreWords) {
    transformedCore.push(applySynonymForced(w, rng));
  }

  // 3. 각 핵심 키워드의 동의어 추가 확대 (2~3개씩)
  const relatedWords: string[] = [];
  const usedWords = new Set(transformedCore.map(w => w.toLowerCase()));

  for (const w of coreWords) {
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === w.toLowerCase())) {
        const others = synonyms.filter(s => {
          const l = s.toLowerCase();
          return l !== w.toLowerCase() && !usedWords.has(l);
        });
        const pickCount = Math.min(others.length, 2 + Math.floor(rng() * 2)); // 2~3개
        const selected = selectSubset(others, pickCount, rng);
        for (const s of selected) {
          relatedWords.push(s);
          usedWords.add(s.toLowerCase());
        }
        break;
      }
    }
  }

  // 4. 카테고리 풀에서 셀러별 다른 서브셋 선택 (4~6개)
  //    상품명 핵심 키워드 또는 치환된 키워드와 글자 겹침이 있는 것만 후보
  //    (남성 운동화에 "하이힐" 같은 무관 키워드 방지)
  const allCoreRef = [...coreWords, ...transformedCore];
  const catCandidates = catKeywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    if (usedWords.has(kwLower)) return false;
    // 핵심/치환 키워드와 2자 이상 겹치면 후보
    for (const ref of allCoreRef) {
      if (ref.length >= 2 && (kwLower.includes(ref) || ref.includes(kwLower))) return true;
    }
    return false;
  });
  // 관련 후보가 부족하면 카테고리 풀 전체에서 보충
  const extraCandidates = catCandidates.length < 4
    ? catKeywords.filter(kw => !usedWords.has(kw.toLowerCase()) && !catCandidates.includes(kw))
    : [];
  const allCatCandidates = [...catCandidates, ...extraCandidates];
  const catPickCount = Math.min(allCatCandidates.length, 4 + Math.floor(rng() * 3)); // 4~6개
  const catSelected = selectSubset(allCatCandidates, catPickCount, rng);
  for (const kw of catSelected) {
    relatedWords.push(kw);
    usedWords.add(kw.toLowerCase());
  }

  // 5. 전체 키워드 조합 (치환된 핵심 + 연관)
  const allWords = [...transformedCore, ...relatedWords];

  // 6. 중복 제거
  const seen = new Set<string>();
  const unique = allWords.filter(w => {
    const l = w.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  // 7. 전체 셔플 (Fisher-Yates)
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }

  // 8. 스펙(용량/갯수)은 맨 뒤에 고정
  for (const s of specs) {
    if (!seen.has(s.toLowerCase())) unique.push(s);
  }

  // 9. 100자 제한
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
