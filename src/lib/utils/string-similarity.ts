/**
 * 한국어 상품명 유사도 계산
 * 단어 매칭(50%) + Levenshtein 거리(30%) + 모델번호 매칭(20%)
 * 0~100 점수 반환
 */

/** 정규화: HTML 태그 제거, 소문자, 특수문자 제거, 공백 정리 */
function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')       // HTML 태그 제거
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ') // 특수문자 → 공백
    .replace(/\s+/g, ' ')
    .trim();
}

/** 모델번호 추출 (영문+숫자 조합, 3자 이상) */
function extractModelNumbers(text: string): string[] {
  const normalized = normalize(text);
  const matches = normalized.match(/[a-z]*\d+[a-z\d]*/g) || [];
  return matches.filter((m) => m.length >= 3);
}

/** 단어 분리 (한글/영문/숫자 단위) */
function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized.split(/\s+/).filter((w) => w.length > 0);
}

/** Levenshtein 거리 (DP) */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // 메모리 최적화: 2행만 사용
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 단어 매칭 점수 (0~1): 원본 단어 중 결과에 포함된 비율 */
function wordMatchScore(sourceWords: string[], targetWords: string[]): number {
  if (sourceWords.length === 0) return 0;

  let matched = 0;
  for (const sw of sourceWords) {
    if (targetWords.some((tw) => tw === sw || tw.includes(sw) || sw.includes(tw))) {
      matched++;
    }
  }
  return matched / sourceWords.length;
}

/** 모델번호 매칭 점수 (0~1) */
function modelMatchScore(sourceModels: string[], targetModels: string[]): number {
  if (sourceModels.length === 0) return 1; // 모델번호 없으면 만점 (패널티 없음)

  let matched = 0;
  for (const sm of sourceModels) {
    if (targetModels.some((tm) => tm === sm || tm.includes(sm) || sm.includes(tm))) {
      matched++;
    }
  }
  return matched / sourceModels.length;
}

/**
 * 두 상품명의 유사도 점수 계산
 * @param source 원본 상품명
 * @param target 비교 대상 상품명
 * @returns 0~100 점수
 */
export function calculateSimilarity(source: string, target: string): number {
  const srcNorm = normalize(source);
  const tgtNorm = normalize(target);

  if (srcNorm === tgtNorm) return 100;
  if (!srcNorm || !tgtNorm) return 0;

  // 1. 단어 매칭 (50%)
  const srcWords = tokenize(source);
  const tgtWords = tokenize(target);
  const wordScore = wordMatchScore(srcWords, tgtWords);

  // 2. Levenshtein 거리 기반 유사도 (30%)
  const maxLen = Math.max(srcNorm.length, tgtNorm.length);
  const dist = levenshtein(srcNorm, tgtNorm);
  const levScore = 1 - dist / maxLen;

  // 3. 모델번호 매칭 (20%)
  const srcModels = extractModelNumbers(source);
  const tgtModels = extractModelNumbers(target);
  const modelScore = modelMatchScore(srcModels, tgtModels);

  const total = wordScore * 50 + levScore * 30 + modelScore * 20;
  return Math.round(Math.max(0, Math.min(100, total)));
}
