/**
 * 건강식품 교차 오염 방지 — 공유 sanitization 함수
 *
 * 모든 콘텐츠 출력 경로(story-generator, persuasion-engine, real-review-composer)에서
 * 호출하여 타 카테고리 성분이 섞인 문장을 제거한다.
 */

const HEALTH_INGREDIENTS_RE = /오메가3|루테인|비오틴|콜라겐|유산균|프로바이오틱스|밀크씨슬|홍삼|마그네슘|칼슘|글루코사민|히알루론산|코엔자임|크릴오일|프로폴리스|쏘팔메토|엽산|가르시니아|스피루리나|클로렐라|흑마늘|비타민[A-EK]|철분|아연|셀레늄|보스웰리아|MSM|진세노사이드|프로틴|WPC|CLA|카테킨|비타민B군/g;

const CATEGORY_INGREDIENT_MAP: Record<string, string[]> = {
  '홍삼': ['홍삼', '진세노사이드', '인삼사포닌'],
  '유산균': ['유산균', '프로바이오틱스', '프리바이오틱스'],
  '프로바이오틱스': ['유산균', '프로바이오틱스', '프리바이오틱스'],
  '오메가': ['오메가3', 'EPA', 'DHA', '크릴오일'],
  '크릴': ['오메가3', '크릴오일'],
  '루테인': ['루테인', '지아잔틴'],
  '밀크': ['밀크씨슬', '밀크시슬', '실리마린'],
  '간건강': ['밀크씨슬', '밀크시슬', '실리마린'],
  '콜라겐': ['콜라겐', '히알루론산', '엘라스틴'],
  '글루코사민': ['글루코사민', '콘드로이친', 'MSM', '보스웰리아'],
  '관절': ['글루코사민', '콘드로이친', 'MSM', '보스웰리아'],
  '코엔자임': ['코엔자임', 'Q10', '유비퀴놀'],
  '쏘팔메토': ['쏘팔메토'],
  '비오틴': ['비오틴', '비타민B7'],
  '엽산': ['엽산', '비타민B12'],
  '가르시니아': ['가르시니아', 'HCA', 'CLA', 'L-카르니틴', '키토산', '카테킨'],
  '다이어트': ['가르시니아', 'HCA', 'CLA', 'L-카르니틴', '키토산', '카테킨'],
  '헬스': ['프로틴', 'BCAA', '크레아틴', 'WPC', '단백질'],
  '프로틴': ['프로틴', 'WPI', 'WPC', 'BCAA', '크레아틴', '단백질'],
  '스피루리나': ['스피루리나'],
  '클로렐라': ['클로렐라'],
  '흑마늘': ['흑마늘', '마늘'],
  '마늘': ['흑마늘', '마늘'],
  '프로폴리스': ['프로폴리스'],
  '초유': ['초유'],
  '삼부커스': ['삼부커스'],
  '로열젤리': ['로열젤리', '벌화분'],
  '석류': ['석류'],
  '비타민c': ['비타민C'],
  '비타민d': ['비타민D'],
  '비타민b': ['비타민B', '비타민B군'],
  '비타민a': ['비타민A'],
  '비타민e': ['비타민E'],
  '비타민k': ['비타민K'],
  '멀티비타민': ['비타민C', '비타민D', '비타민B', '비타민B군', '비타민A', '비타민E', '비타민K', '비오틴', '엽산', '철분', '아연', '셀레늄', '마그네슘', '칼슘'],
  '종합비타민': ['비타민C', '비타민D', '비타민B', '비타민B군', '비타민A', '비타민E', '비타민K', '비오틴', '엽산', '철분', '아연', '셀레늄', '마그네슘', '칼슘'],
  '칼슘': ['칼슘', '마그네슘'],
  '마그네슘': ['마그네슘', '칼슘'],
  '철분': ['철분'],
  '아연': ['아연'],
  '셀레늄': ['셀레늄'],
  '타우린': ['타우린'],
  'bcaa': ['BCAA'],
  '크레아틴': ['크레아틴'],
  '글루타민': ['L-글루타민', '글루타민'],
  '라이신': ['L-라이신', '라이신'],
  '아미노산': ['BCAA', 'L-라이신', 'L-글루타민', '아미노산', '타우린', '크레아틴'],
  '복합아미노산': ['BCAA', 'L-라이신', 'L-글루타민', '아미노산', '타우린'],
  '게이너': ['프로틴', 'WPC', '단백질', 'BCAA', '크레아틴'],
  '카제인': ['프로틴', '단백질', '카제인'],
};

export interface ProductContext {
  ingredients?: string[];
  effects?: string[];
  [key: string]: unknown;
}

export function buildExpectedTerms(
  categoryPath: string,
  productName: string,
): Set<string> {
  const expectedTerms = new Set<string>();
  const path = categoryPath.toLowerCase();
  const nameLower = productName.toLowerCase();
  for (const [key, ingredients] of Object.entries(CATEGORY_INGREDIENT_MAP)) {
    if (path.includes(key) || nameLower.includes(key)) {
      for (const ing of ingredients) expectedTerms.add(ing);
    }
  }
  return expectedTerms;
}

export function sanitizeHealthText(
  text: string,
  categoryPath: string,
  productName: string,
): string {
  if (!categoryPath.includes('건강식품')) return text;
  const expected = buildExpectedTerms(categoryPath, productName);
  if (expected.size === 0) return text;
  const sentences = text.split(/(?<=[.!?。요])\s+/);
  const filtered = sentences.filter(s => {
    const mentions = s.match(HEALTH_INGREDIENTS_RE);
    if (!mentions) return true;
    return mentions.every(m => expected.has(m));
  });
  const result = filtered.join(' ').trim();
  return result || text.slice(0, 50);
}
