/**
 * 큐레이션 스톡 이미지 뱅크 — 카테고리 경로 ↔ bank key 매핑
 * 클라이언트/서버 공용
 */

export const STOCK_CATEGORY_MAP: Record<string, { key: string; label: string }> = {
  '식품>신선식품>과일류>과일>사과': { key: 'apple', label: '사과' },
  '식품>신선식품>과일류>과일>배': { key: 'pear', label: '배' },
  '식품>신선식품>과일류>과일>감귤': { key: 'mandarin', label: '감귤' },
  '식품>신선식품>과일류>과일>귤': { key: 'mandarin', label: '귤' },
  '식품>신선식품>과일류>과일>포도': { key: 'grape', label: '포도' },
  '식품>신선식품>과일류>과일>수박': { key: 'watermelon', label: '수박' },
  '식품>신선식품>과일류>과일>딸기': { key: 'strawberry', label: '딸기' },
  '식품>신선식품>과일류>과일>복숭아': { key: 'peach', label: '복숭아' },
  '식품>신선식품>과일류>과일>망고': { key: 'mango', label: '망고' },
  '식품>신선식품>과일류>과일>바나나': { key: 'banana', label: '바나나' },
  '식품>신선식품>과일류>과일>키위': { key: 'kiwi', label: '키위' },
  '식품>신선식품>과일류>과일>참외': { key: 'chamoe', label: '참외' },
  '식품>신선식품>과일류>과일>체리': { key: 'cherry', label: '체리' },
  '식품>신선식품>과일류>과일>블루베리': { key: 'blueberry', label: '블루베리' },
};

/**
 * longest prefix match로 카테고리 키 조회
 * 예: '식품>신선식품>과일류>과일>사과>부사' → { key: 'apple', label: '사과' }
 */
export function resolveStockCategoryKey(
  categoryPath: string,
): { key: string; label: string } | null {
  if (!categoryPath) return null;

  // 정확 매치 우선
  if (STOCK_CATEGORY_MAP[categoryPath]) {
    return STOCK_CATEGORY_MAP[categoryPath];
  }

  // longest prefix match
  let bestMatch = '';
  let bestResult: { key: string; label: string } | null = null;

  for (const [path, info] of Object.entries(STOCK_CATEGORY_MAP)) {
    if (categoryPath.startsWith(path) && path.length > bestMatch.length) {
      bestMatch = path;
      bestResult = info;
    }
  }

  return bestResult;
}
