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
 * 토큰 희소성(IDF) — **인덱스 데이터에서 직접 계산한다(하드코딩 아님)**.
 * ---------------------------------------------------------------------------
 * ⚠️ 예전엔 모든 토큰을 같은 무게로 셌다. 그래서 수천 개 카테고리에 흔히 박혀 있는
 *    일반어('남성·아기·차량용·무선·세트·액세서리')가, 정작 상품을 특정하는 희귀어
 *    ('런닝화·물티슈·거치대·이어폰')를 눌러 이겼다. 실측 오분류:
 *      · "남성 러닝화" → 남성 파운데이션 쿠션(뷰티)      · "아기 물티슈" → 아기 좁쌀베개
 *      · "차량용 거치대" → 자전거 차량용 거치대           · "블루투스 이어폰" → 무전기 무선+무선
 * → 16k 인덱스에서 토큰별 등장 카테고리 수(df)를 세어 흔할수록 가중치를 낮춘다.
 *   흔한 말은 거들 뿐이고, 희귀어가 카테고리를 정한다.
 */
let IDF = null;
function idfOf(t) {
  if (!IDF) {
    const idx = load();
    const df = new Map();
    for (const [, path, leaf] of idx) {
      for (const tk of new Set([...rawTokens(path), ...rawTokens(leaf)])) df.set(tk, (df.get(tk) || 0) + 1);
    }
    const N = idx.length;
    IDF = { df, N };
  }
  const d = IDF.df.get(t) || 1;
  // log 스케일을 0.25~1.6 으로 정규화 — 아주 흔한 말도 0 은 아니고(문맥엔 기여),
  // 아주 희귀한 말이 과도하게 지배하지도 않게.
  const raw = Math.log(IDF.N / d) / Math.log(IDF.N);   // 0(모든 행에 등장) ~ 1(1행에만)
  return 0.25 + 1.35 * Math.max(0, Math.min(1, raw));
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
    let lt = tokens(leaf);
    const pt = tokens(path);
    // leaf 가 통째로 용도 수식어인 카테고리('…제습기 > 가정용')는 leaf 만으로는 정체를 알 수 없다.
    //   이때는 경로의 마지막 실단어('제습기')를 사실상의 leaf 로 본다 — 안 그러면 leaf 점수가
    //   0 이 돼서 "가정용 제습기" 가 엉뚱한 '물통' 카테고리에 진다(실측).
    if (lt.length === 0 && pt.length > 0) lt = pt.slice(-1);
    // 한국어 합성어 대응: 완전일치(1.0) + 부분포함(0.7, 예: '수분크림' ⊇ '크림').
    //   ⚠️ 부분포함을 완전일치와 같은 점수로 주면 "통영 자연산 생굴"의 '자연산'이 도서 카테고리
    //      '자연'을 정타로 만들어 진짜 품목('굴')과 동점이 된다 → 부분일치는 낮게 친다.
    //   ⭐ 역방향(leaf 합성어 ⊃ 질의 토큰)도 0.5 로 인정한다 — 쿠팡 카테고리명은 죄다
    //      붙여쓰기 합성어('블루투스이어폰', '다운패딩조끼', '유아물티슈', '남성 런닝화')인데
    //      상품명은 띄어 쓴다('블루투스 무선 이어폰'). 예전엔 정방향만 봐서 **세부 카테고리일수록
    //      매칭이 안 되고** 엉뚱한 상위/유사 카테고리가 이겼다(실측: 이어폰→무전기 '무선+무선',
    //      차량용 거치대→자전거 거치대, 아기 물티슈→좁쌀베개). 과매칭을 막으려고 가중치는 낮게.
    const hit = (t) => {
      if (qt.has(t)) return 1;
      if (t.length < 2) return 0;
      for (const q of qt) {
        if (q.length > t.length && q.includes(t)) return 0.85;   // 질의 합성어 ⊃ leaf 토큰
      }
      // 역방향은 **글자 커버리지**로 잰다 — leaf 합성어의 몇 %가 질의 단어들로 설명되는가.
      //   '블루투스이어폰'(7자) ⊃ '블루투스'(4)+'이어폰'(3) = 100% → 사실상 정타
      //   '유아물티슈'(5자) ⊃ '물티슈'(3) = 60%
      //   '자전거 차량용 거치대' 의 '자전거' 는 0% → 커버리지 정규화에서 감점된다
      const covered = new Set();
      for (const q of qt) {
        if (q.length < 2) continue;
        let i = t.indexOf(q);
        while (i >= 0) { for (let k = i; k < i + q.length; k++) covered.add(k); i = t.indexOf(q, i + 1); }
      }
      if (covered.size === 0) return fuzzyHit(t) ? 0.6 : 0;
      return Math.min(0.95, covered.size / t.length);
    };
    // 한글 표기 흔들림(러닝화↔런닝화, 어댑터↔아답터) — 3글자 이상 + 1글자 차이만 인정.
    //   동의어 사전을 박지 않고 표기 변형만 흡수한다.
    function fuzzyHit(t) {
      if (t.length < 3) return false;
      for (const q of qt) {
        if (q.length !== t.length || q.length < 3) continue;
        let diff = 0;
        for (let i = 0; i < t.length; i++) if (t[i] !== q[i] && ++diff > 1) break;
        if (diff === 1) return true;
      }
      return false;
    }
    // ⭐ 커버리지 정규화 — "leaf 의 단어가 **전부** 설명되는가"를 본다.
    //    예전엔 맞은 개수만 더해서, leaf 의 일부만 맞아도 점수가 쌓였다:
    //      "아기 물티슈" → '아기 좁쌀베개'(아기만 맞음)가 '유아물티슈'를 이김
    //      "남성 러닝화" → '남성 파운데이션 쿠션'(남성·쿠션만 맞음)이 1위
    //    맞은 무게 ÷ leaf 전체 무게 로 나누면, 설명 안 되는 단어가 많을수록 감점된다.
    const weighted = (toks) => {
      let matched = 0, total = 0;
      for (const t of toks) { const w = idfOf(t); total += w; matched += hit(t) * w; }
      return total > 0 ? { ratio: matched / total, mass: matched } : { ratio: 0, mass: 0 };
    };
    const L = weighted(lt), P = weighted(pt);
    // leaf: 커버리지(정확도) 위주 + 매칭 질량 약간(긴 leaf 가 손해보지 않게)
    let score = 3 * L.ratio + 0.5 * Math.min(L.mass, 2);
    // 경로: 도메인이 맞는지(가전인가 식품인가) 정도의 보조 신호
    score += 1 * P.ratio + 0.25 * Math.min(P.mass, 3);
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
  // ⚠️ 불용어 필터를 거치면 '가정용' 같은 leaf 가 "토큰 0개"가 돼 경로에 이미 있는데도
  //    또 덧붙는다("…제습기 가정용 가정용"). 원시 토큰으로 판정한다.
  const lt = rawTokens(l);
  const pt = new Set(rawTokens(path));
  const included = lt.length > 0 && lt.every((t) => pt.has(t));
  return included ? String(path) : `${path} ${l}`;
}
