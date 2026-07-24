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
  const p = join(here, 'data', 'coupang-cat-index.json');
  let raw;
  try {
    raw = readFileSync(p, 'utf8');
  } catch (e) {
    // runtime/ 동기화에서 data/ 가 빠지면 여기서 raw ENOENT 로 죽어 원인 파악이 어려웠다.
    throw new Error(`카테고리 인덱스를 찾을 수 없습니다: ${p} — worker/lib/data/ 가 복사됐는지 확인 (desktop 은 'node sync-runtime.mjs') [${e.code || e.message}]`);
  }
  INDEX = JSON.parse(raw); // [code, path, leaf, depth]
  return INDEX;
}

/**
 * 매칭에서 제외할 단어.
 *   ⚠️ '가정용·선물용·업소용' 같은 **용도 수식어**가 특히 위험하다 — 쿠팡 인덱스에는
 *      leaf 가 통째로 '가정용' 인 카테고리가 여럿 있어서(예: 63362 "…공기청정기 > 가정용"),
 *      "가정용 나주배" 같은 상품명이 leaf 완전일치(+3)로 가전 카테고리를 1위로 끌어올렸다
 *      (실측 오분류: 나주배 → 가습기/에어워셔/공기청정기 가정용).
 *      용도어를 빼도 진짜 가전 상품은 '공기청정기·제습기' 같은 본체 명사로 매칭된다.
 */
const STOP = new Set([
  '그리고', '또는', '용', '및', '개', '세트', '대용량', '정품',
  '가정용', '선물용', '업소용', '사무실용', '가정', '선물', '무료배송', '특가', '신상품', '인기', '추천',
]);
/** 원시 토큰(필터 전) — 아래 세 토큰화의 공통 기반. */
const rawTokens = (s) => String(s || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || [];
/** 2글자 이상 일반 토큰(매칭 주력) */
function tokens(s) {
  return rawTokens(s).filter((t) => t.length >= 2 && !STOP.has(t));
}
/** 띄어쓰기로 홀로 선 1글자 한글 토큰(배·감·굴·무·팥…) — 1글자 leaf 매칭에만 쓴다. */
function tokens1(s) {
  return [...new Set(rawTokens(s).filter((t) => t.length === 1 && /[가-힣]/.test(t)))];
}
/**
 * 1글자 leaf 전용 토큰화.
 *   ⚠️ 쿠팡 인덱스에는 leaf 가 1글자인 카테고리가 45개 있다(배·감·귤·밤·잣·굴·무·마·팥·조·묵·엿·톳·칡 …
 *      대부분 신선식품). tokens() 가 2글자 미만을 버리므로 이 45개는 **leaf 점수를 영원히 0점**으로
 *      받아 후보에 아예 못 올라왔다 = LLM 이 아무리 똑똑해도 "배"를 고를 수가 없었다.
 *   → leaf 에서 2글자+ 토큰이 하나도 안 나오는 경우에만 1글자 토큰을 살린다(대상 45개로 한정).
 */
function leafTokens1(leaf) {
  const raw = rawTokens(leaf);
  // ⚠️ STOP 필터가 아니라 "원시 토큰" 으로 판정해야 한다. tokens() 로 재면 leaf 가 통째로
  //    불용어인 카테고리('가정용')가 1글자 leaf 로 오인돼 가·정·용 낱자 매칭이 터진다.
  if (raw.some((t) => t.length >= 2)) return [];
  return [...new Set(raw.filter((t) => /^[가-힣]$/.test(t)))];
}

/**
 * 상품명으로 top-K 카테고리 후보.
 * @returns {Array<{code:string, path:string}>}
 */
export function topCandidates(productName, k = 8) {
  const idx = load();
  const qt = new Set(tokens(productName));
  const q1 = new Set(tokens1(productName));   // 질의의 1글자 한글(예: "… 배 배 배" → '배')
  if (qt.size === 0 && q1.size === 0) return [];
  // 1글자 leaf 는 "지역명+품목" 합성어의 꼬리로 등장하는 경우가 압도적이다(나주배·신고배·햇감·자연산굴).
  //   → 질의 토큰의 마지막 글자 집합을 미리 모아 둔다(길이 4 이하만: 과매칭 억제).
  const qTail = new Set([...qt].filter((t) => t.length <= 4 && /[가-힣]$/.test(t)).map((t) => t.slice(-1)));
  const scored = [];
  for (const row of idx) {
    const [code, path, leaf, depth] = row;
    const lt = tokens(leaf);
    const pt = tokens(path);
    // 한국어 합성어 대응: 완전일치(1.0) + 부분포함(0.7, 예: '수분크림' ⊇ '크림').
    //   ⚠️ 부분포함을 완전일치와 같은 점수로 주면 "통영 자연산 생굴"의 '자연산'이 도서 카테고리
    //      '자연'을 정타로 만들어 진짜 품목('굴')과 동점이 된다 → 부분일치는 낮게 친다.
    const hit = (t) => {
      if (qt.has(t)) return 1;
      if (t.length >= 2) { for (const q of qt) if (q.length > t.length && q.includes(t)) return 0.7; }
      return 0;
    };
    let score = 0;
    for (const t of lt) score += 3 * hit(t);             // leaf 일치 가중
    for (const t of pt) score += 1 * hit(t);             // 경로 일치
    // 1글자 leaf(배·감·굴·무…) — 독립 토큰이면 leaf 완전일치, 합성어 꼬리(나주배)면 한 단계 낮게.
    //   여기서 노리는 건 정밀도가 아니라 **후보 진입(recall)** 이다. 최종 선택은 LLM 이
    //   원본 카테고리 앵커와 함께 판단하고 snapToCandidate 가 코드로 확정한다.
    //   상품명에 홀로 선 1글자 한글(배·굴·감)은 품목을 정확히 지목하는 강한 신호라
    //   일반 leaf 일치(+3)보다 높게 준다 — 안 그러면 "통영 자연산 생굴"이 '자연'(도서)에 진다.
    for (const c of leafTokens1(leaf)) {
      if (q1.has(c)) score += 4;
      else if (qTail.has(c)) score += 2.5;
    }
    // ⚠️ 깊이 보너스는 "매칭이 하나라도 있을 때"만 준다.
    //    예전엔 무조건 +0.5 라서 **겹치는 단어가 0개인 카테고리도 0.5점으로 후보에 올랐다**
    //    (16k 중 depth≥3 이 사실상 전부). 그래서 후보 8개 중 7개가 무작위 쓰레기(가구부속자재·
    //    거실테이블…)로 채워졌고, LLM 은 그 중에서 고르느라 엉뚱한 카테고리를 뱉었다.
    if (score > 0) {
      if (Number(depth) >= 3) score += 0.5;              // 세부 카테고리 선호
      scored.push({ code: String(code), path: String(path), leaf: String(leaf || ''), score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  // score 를 함께 돌려준다 — 호출부(ai-batch)가 "압도적 1위면 LLM 생략" 판단에 쓴다.
  return scored.slice(0, k).map(({ code, path, leaf, score }) => ({ code, path: withLeaf(path, leaf), leaf, score }));
}

/**
 * 후보 경로에 leaf 를 되살린다.
 *   ⚠️ 인덱스의 path 는 "토큰 문자열"이라 1글자 토큰이 이미 잘려 있다.
 *      그래서 배(59357)의 path 가 `식품 신선식품 과일류 과일` — **'배'라는 단어가 없다**.
 *      이 문자열을 그대로 LLM 후보로 주면, LLM 은 그게 '배' 카테고리인지 알 방법이 없어
 *      옆의 '과일선물세트 사과 과일세트' 를 고른다(실측). 검수화면에 뜨는 경로도 마찬가지.
 *   → path 에 leaf 가 안 담겼으면 뒤에 붙여서 돌려준다.
 */
function withLeaf(path, leaf) {
  const l = String(leaf || '').trim();
  if (!l) return String(path);
  const lt = tokens(l);
  const pt = new Set(tokens(path));
  const included = lt.length > 0 && lt.every((t) => pt.has(t));
  return included ? String(path) : `${path} ${l}`;
}
