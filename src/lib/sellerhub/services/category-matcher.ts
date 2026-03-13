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

/**
 * 상품명으로 쿠팡 카테고리를 자동 매칭한다.
 * 3단계 폴백:
 *  1. 쿠팡 autoCategorize API
 *  2. 상품명 키워드 검색 → 가장 깊은(구체적인) 카테고리
 *  3. AI (OpenAI) 매핑
 */
export async function matchCategory(
  productName: string,
  adapter: CoupangAdapter,
): Promise<CategoryMatchResult | null> {
  // 1단계: 쿠팡 자동 카테고리 API
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
    // 상품명에서 핵심 키워드 추출 (첫 2-3 단어)
    const keywords = extractKeywords(productName);
    for (const keyword of keywords) {
      const searchResult = await adapter.searchCategory(keyword);
      if (searchResult.items.length > 0) {
        // path(wholeCategoryName)가 가장 긴 것 = 가장 구체적인 카테고리
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
 * 상품명에서 검색용 키워드를 추출한다.
 * 예: "네이처메이드 비오틴 5000mcg 120정" → ["비오틴", "네이처메이드 비오틴"]
 */
function extractKeywords(productName: string): string[] {
  const words = productName
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const keywords: string[] = [];

  // 한글 단어 우선 (브랜드명 등 영문 제외)
  const koreanWords = words.filter((w) => /[가-힣]/.test(w));

  // 핵심 단어 (2-3글자 이상 한글 명사)
  if (koreanWords.length >= 2) {
    keywords.push(koreanWords.slice(0, 2).join(' '));
  }
  if (koreanWords.length >= 1) {
    keywords.push(koreanWords[0]);
  }

  // 전체 상품명의 앞 부분
  if (words.length >= 2) {
    keywords.push(words.slice(0, 3).join(' '));
  }

  return [...new Set(keywords)];
}
