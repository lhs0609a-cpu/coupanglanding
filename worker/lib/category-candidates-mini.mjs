/**
 * 카테고리 후보 추출 (워커/오프라인, 토큰 매칭)
 * ---------------------------------------------------------------------------
 * coupang-cat-index.json([code, path, leaf, depth] × 16k)에서 상품명과
 * 토큰이 겹치는 leaf 카테고리 top-K 를 뽑는다. LLM은 이 후보 중에서만 고르므로
 * 한자 누출/환각이 사라진다. (정밀 매칭은 웹의 category-matcher 가 담당)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

let INDEX = null;
function load() {
  if (INDEX) return INDEX;
  const raw = readFileSync(join(here, 'data', 'coupang-cat-index.json'), 'utf8');
  INDEX = JSON.parse(raw); // [code, path, leaf, depth]
  return INDEX;
}

const STOP = new Set(['그리고', '또는', '용', '및', '개', '세트', '대용량', '정품']);
function tokens(s) {
  return (String(s || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || [])
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/**
 * 상품명으로 top-K 카테고리 후보.
 * @returns {Array<{code:string, path:string}>}
 */
export function topCandidates(productName, k = 8) {
  const idx = load();
  const qt = new Set(tokens(productName));
  if (qt.size === 0) return [];
  const scored = [];
  for (const row of idx) {
    const [code, path, leaf, depth] = row;
    const lt = tokens(leaf);
    const pt = tokens(path);
    // 한국어 합성어 대응: 완전일치 + 부분포함(예: '수분크림' ⊇ '크림')
    const hit = (t) => {
      if (qt.has(t)) return true;
      // 합성어 접미만: 질의 토큰이 leaf 토큰을 포함(예: '수분크림' ⊇ '크림'). 역방향은 과매칭이라 제외.
      if (t.length >= 2) { for (const q of qt) if (q.length > t.length && q.includes(t)) return true; }
      return false;
    };
    let score = 0;
    for (const t of lt) if (hit(t)) score += 3;          // leaf 일치 가중
    for (const t of pt) if (hit(t)) score += 1;           // 경로 일치
    if (Number(depth) >= 3) score += 0.5;                // 세부 카테고리 선호
    if (score > 0) scored.push({ code: String(code), path: String(path), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(({ code, path }) => ({ code, path }));
}
