// ============================================================
// 카테고리 자동 매칭 서비스
// 3단계 폴백: 쿠팡 API → 키워드 검색 → AI
// ============================================================

import { CoupangAdapter } from '../adapters/coupang.adapter';
import { mapCategory } from './ai.service';

export interface CategoryMatchResult {
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  confidence: number;
  source: 'coupang_api' | 'coupang_search' | 'ai';
}

// 노이즈 필터 — 카테고리 검색에 무의미한 토큰
const NOISE_WORDS = new Set([
  // 단위
  'mg', 'mcg', 'iu', 'ml', 'g', 'kg',
  '정', '개', '병', '통', '캡슐', '포', '박스', '봉', '팩', '세트', '매', '장', '알',
  // 수식어
  '남성', '여성', '프리미엄', '고함량', '저분자', '먹는', '국내', '해외',
  '추천', '인기', '베스트', '대용량', '소용량', '순수', '천연', '식물성',
  // 기타
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품',
  // 일반 서술어
  '함유', '효능', '효과', '예방', '개선', '상품상세참조', '풍성한',
  'new', 'box', 'haccp',
]);
const NOISE_PATTERNS = [
  /^\d+$/, // 순수 숫자
  /^\d+\+\d+$/, // 1+1, 2+1
  /^\d+(개월|일|주)분?$/, // 3개월분, 30일분
];

/**
 * 상품명을 노이즈 필터링된 의미 토큰으로 분리한다.
 */
function tokenize(productName: string): string[] {
  return productName
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => {
      if (w.length <= 1) return false;
      if (NOISE_WORDS.has(w)) return false;
      if (NOISE_PATTERNS.some((p) => p.test(w))) return false;
      return true;
    });
}

/**
 * 상품명으로 쿠팡 카테고리를 자동 매칭한다.
 * 3단계 폴백:
 *  1. 쿠팡 autoCategorize API (전체 상품명)
 *  2. 키워드 검색 → 가장 깊은(구체적인) 카테고리
 *  3. AI (OpenAI) 매핑
 *
 * overrideKeywords: 배치에서 교차분석으로 찾은 키워드를 직접 전달 (Tier 2 검색용)
 */
export async function matchCategory(
  productName: string,
  adapter: CoupangAdapter,
  overrideKeywords?: string[],
): Promise<CategoryMatchResult | null> {
  // 1단계: 쿠팡 자동 카테고리 API (전체 상품명 그대로)
  try {
    const result = await adapter.autoCategorize(productName);
    if (result?.predictedCategoryId) {
      return {
        categoryCode: result.predictedCategoryId,
        categoryName: result.predictedCategoryName,
        categoryPath: result.predictedCategoryName,
        confidence: 0.85,
        source: 'coupang_api',
      };
    }
  } catch {
    // 폴백
  }

  // 2단계: 키워드 검색 → 가장 구체적인 카테고리 선택
  try {
    const keywords = overrideKeywords || extractKeywords(productName);
    for (const keyword of keywords) {
      const searchResult = await adapter.searchCategory(keyword);
      if (searchResult.items.length > 0) {
        const deepest = searchResult.items.sort((a, b) =>
          (b.path?.length || 0) - (a.path?.length || 0)
        )[0];
        return {
          categoryCode: deepest.id,
          categoryName: deepest.name,
          categoryPath: deepest.path || deepest.name,
          confidence: 0.7,
          source: 'coupang_search',
        };
      }
    }
  } catch {
    // 폴백
  }

  // 3단계: AI 매핑
  try {
    const aiResult = await mapCategory(productName, '', 'coupang');
    if (aiResult.categoryId) {
      return {
        categoryCode: aiResult.categoryId,
        categoryName: aiResult.categoryName,
        categoryPath: aiResult.categoryName,
        confidence: aiResult.confidence,
        source: 'ai',
      };
    }
  } catch {
    // AI 키 없거나 실패
  }

  return null;
}

/**
 * 배치 카테고리 매칭 — 교차 상품 빈도 분석 + 캐시
 *
 * 핵심: 개별 상품 키워드가 아닌, 배치 전체에서 가장 많은 상품에 등장하는
 * 단어(document frequency)를 카테고리 키워드로 사용한다.
 *
 * 예: 100개 비오틴 상품 → "비오틴"이 95개 상품에 등장 → 1회 API 호출
 */
export async function matchCategoryBatch(
  productNames: string[],
  adapter: CoupangAdapter,
): Promise<(CategoryMatchResult | null)[]> {
  const results: (CategoryMatchResult | null)[] = new Array(productNames.length).fill(null);
  const cache = new Map<string, CategoryMatchResult | null>();

  // === Phase 1: 교차 상품 Document Frequency 분석 ===
  const productTokensList: string[][] = productNames.map((name) => tokenize(name));

  // 각 단어가 몇 개 상품에 등장하는지 (document frequency)
  const docFreq = new Map<string, number>();
  for (const tokens of productTokensList) {
    const unique = new Set(tokens);
    for (const w of unique) {
      docFreq.set(w, (docFreq.get(w) || 0) + 1);
    }
  }

  // DF 내림차순 정렬
  const sortedByDF = [...docFreq.entries()]
    .sort((a, b) => b[1] - a[1]);

  // === Phase 2: 배치 키워드로 그룹 매칭 ===
  // DF ≥ 30% (최소 2개)인 단어 = 배치 레벨 카테고리 키워드
  const threshold = Math.max(2, Math.floor(productNames.length * 0.3));
  const batchKeywords = sortedByDF
    .filter(([, count]) => count >= threshold)
    .map(([word]) => word);

  // 각 배치 키워드에 대해 1회 API 호출
  for (const batchKw of batchKeywords) {
    if (cache.has(batchKw)) continue;

    // 대표 상품 선택: 이 키워드를 포함하면서 키워드가 가장 앞에 있는 상품
    let bestIdx = -1;
    let bestPos = Infinity;
    for (let i = 0; i < productTokensList.length; i++) {
      const pos = productTokensList[i].indexOf(batchKw);
      if (pos >= 0 && pos < bestPos) {
        bestPos = pos;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;

    // matchCategory에 overrideKeywords로 배치 키워드 직접 전달
    const searchKeywords = [batchKw];
    // 2순위 배치 키워드 조합 추가
    const secondKw = batchKeywords.find((k) => k !== batchKw && docFreq.get(k)! >= threshold);
    if (secondKw) {
      searchKeywords.push(`${batchKw} ${secondKw}`);
    }

    try {
      const result = await matchCategory(productNames[bestIdx], adapter, searchKeywords);
      cache.set(batchKw, result);
    } catch {
      cache.set(batchKw, null);
    }

    await delay(300);
  }

  // 배치 키워드 결과를 해당 상품에 분배
  for (let i = 0; i < productNames.length; i++) {
    const tokens = new Set(productTokensList[i]);
    for (const batchKw of batchKeywords) {
      if (tokens.has(batchKw) && cache.has(batchKw) && cache.get(batchKw)) {
        results[i] = cache.get(batchKw)!;
        break;
      }
    }
  }

  // === Phase 3: 미매칭 상품 — 개별 매칭 ===
  for (let i = 0; i < results.length; i++) {
    if (results[i]) continue; // 이미 배치에서 매칭됨

    const keywords = extractKeywords(productNames[i]);
    const primaryKey = keywords[0];

    if (cache.has(primaryKey)) {
      results[i] = cache.get(primaryKey) ?? null;
      continue;
    }

    try {
      const result = await matchCategory(productNames[i], adapter, keywords);
      cache.set(primaryKey, result);
      results[i] = result;
    } catch {
      cache.set(primaryKey, null);
    }

    await delay(300);
  }

  return results;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 상품명에서 검색용 키워드를 빈도 기반으로 추출한다 (단일 상품용).
 *
 * 예: "비타민 H 비오틴 먹는 손톱 머리카락 모발 영양제 비오틴 비오틴 비오틴"
 * → 노이즈 제거 후 빈도: { 비오틴: 4, 비타민: 1, 영양제: 1, ... }
 * → ["비오틴", "비오틴 영양제", "비타민 비오틴"]
 */
function extractKeywords(productName: string): string[] {
  const meaningful = tokenize(productName);

  if (meaningful.length === 0) {
    const words = productName.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/).filter((w) => w.length >= 2).slice(0, 2);
    return words.length > 0 ? [words.join(' ')] : [productName.slice(0, 10)];
  }

  // 빈도 계산
  const freq = new Map<string, number>();
  for (const w of meaningful) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // 빈도순 정렬 (동일 빈도면 먼저 등장한 순서)
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  const top = sorted[0];
  const second = sorted[1];
  const keywords: string[] = [];

  // 1. 빈도 1위 단독
  keywords.push(top);

  // 2. 빈도 1위 + 2위 조합
  if (second) {
    keywords.push(`${top} ${second}`);
  }

  // 3. 한글 단어 중 빈도 1위가 아닌 첫 단어 + 빈도 1위
  const koreanOther = sorted.find((w) => w !== top && /[가-힣]/.test(w));
  if (koreanOther) {
    const combo = `${koreanOther} ${top}`;
    if (!keywords.includes(combo)) {
      keywords.push(combo);
    }
  }

  return keywords;
}
