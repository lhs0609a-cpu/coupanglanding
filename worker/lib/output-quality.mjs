/**
 * 올인원 생성물 품질 가드 (워커 — 순수 함수, 의존성 없음)
 * ---------------------------------------------------------------------------
 * compliance-mini(법적 금지어)가 못 잡는 "품질 오염"을 검출한다.
 *   - 외국어(한자/중국어/일본어) 혼입 — 로컬 LLM(qwen 등)이 자주 흘림
 *   - JSON/태그/프롬프트 누출 (깨진 파싱으로 원문이 필드에 통째 저장된 경우)
 *   - 이모지 스팸 / 한글 비율 미달 / 길이 이탈
 * 결과는 needsReview 판정과 검수화면 사유 표기에 쓴다.
 */

// 한글(음절+자모) / 라틴 / CJK표의문자·가나(=외국어) 판별용 범위
const RE_HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/g;
const RE_LATIN = /[A-Za-z]/g;
// 한자(漢字)·중국어·일본어 가나 — 순한국어 카피엔 나오면 안 됨
const RE_CJK_FOREIGN = /[一-鿿㐀-䶿豈-﫿぀-ゟ゠-ヿ]/;
// 구조 누출: 중괄호/JSON 키/가짜 대화·툴콜 태그
const RE_STRUCT_LEAK = /[{}]|<\/?[a-z_][a-z0-9_]*>|"(displayName|keywords|options|categoryPath|confidence)"\s*:/i;
// 이모지(그림문자) — displayName 등 짧은 필드엔 부적합
const RE_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/u;
// 쿠팡 SEO 금지 표현(광고/판촉·과장/효능·참조마커) — 노출상품명/상세 공통
const RE_SEO_BANNED = /무료\s*배송|특가|할인|세일|사은품|이벤트|증정|쿠폰|적립|사은|최고|최상|최강|1위|no\.?\s*1|완치|100\s*%|효과\s*만점|의학적|상세\s*페이지\s*참조|상페\s*참조|상세\s*참조|최저가/i;
// 노출상품명 검색노이즈 — 법적 금지는 아니나 구매자가 검색창에 안 치는 주관·홍보 형용사.
//   LLM 이 "…합리적 세트", "…프리미엄" 처럼 지어붙이면 검색 매칭이 흐려진다.
const RE_SEO_FILLER = /합리적|프리미엄|고급스?러|인기(?:상품|템)?|베스트\s*셀러|강력\s*추천|강추|알뜰|필수템|득템|대박|완벽한?|갑성비|초특가|핫딜|가성비\s*(?:갑|템|최고)/;
// 쿠팡 검색 오류 유발 특수문자
const RE_SEO_SPECIAL = /[★☆●◆■※♥♡【】《》①②③④⑤⑥▶◀→]/;
// 노출상품명은 "명사구"여야 한다 — 서술어·부사·조사로 이어진 "문장"이면 SEO 매칭이 깨진다.
//   실측: "에서 정성스럽게 재배한 기능성 쌀 입니다 안심하고 드셔도 됩니다" 처럼 원본 설명
//   문장이 노출명으로 그대로 들어가는 사고. 아래 표지가 있으면 문장으로 보고 재생성시킨다.
const RE_TITLE_SENTENCE = /입니다|습니다|됩니다|합니다|해요|이에요|예요|드셔도|드세요|하세요|주세요|었어요|았어요|스럽게|정성스|재배한|만들어|안심하고|믿을\s*수|드립니다|해드/;

/** 문자열에서 한자/중국어/일본어(외국어 문자) 포함 여부 */
export function hasForeignCJK(text) {
  return RE_CJK_FOREIGN.test(String(text || ''));
}

/** 구조(JSON/태그/프롬프트) 누출 여부 */
export function hasStructLeak(text) {
  return RE_STRUCT_LEAK.test(String(text || ''));
}

/** 한글 비율 = 한글 글자 / (한글+라틴+외국어 글자). 문장부호·공백·숫자 제외. */
export function koreanRatio(text) {
  const s = String(text || '');
  const ko = (s.match(RE_HANGUL) || []).length;
  const lat = (s.match(RE_LATIN) || []).length;
  const cjk = (s.match(new RegExp(RE_CJK_FOREIGN.source, 'g')) || []).length;
  const denom = ko + lat + cjk;
  return denom === 0 ? 0 : ko / denom;
}

/** 이모지 포함 여부 */
export function hasEmoji(text) {
  return RE_EMOJI.test(String(text || ''));
}

/**
 * 노출상품명 품질 검사.
 * @returns {{ ok:boolean, issues:string[] }}
 */
export function checkDisplayName(name) {
  const s = String(name || '').trim();
  const issues = [];
  if (s.length < 6) issues.push('노출명 너무 짧음');
  if (s.length > 100) issues.push('노출명 너무 긺(원문 누출 의심)');
  if (hasStructLeak(s)) issues.push('노출명 JSON/태그 누출');
  if (hasForeignCJK(s)) issues.push('노출명 한자/외국어 혼입');
  if (hasEmoji(s)) issues.push('노출명 이모지 혼입');
  if (s && koreanRatio(s) < 0.4) issues.push('노출명 한글 비율 미달');
  if (RE_SEO_BANNED.test(s)) issues.push('노출명 금지/과장 표현(쿠팡SEO)');
  if (RE_SEO_FILLER.test(s)) issues.push('노출명 홍보/주관 형용사(SEO 노이즈)');
  if (RE_SEO_SPECIAL.test(s)) issues.push('노출명 특수문자(검색오류)');
  // 문장(서술어·부사) — 명사구여야 하는데 원본 설명 문장이 통째로 들어온 경우
  if (RE_TITLE_SENTENCE.test(s)) issues.push('노출명이 문장체(서술어/부사) — 명사구로');
  // 같은 단어 3회 이상 반복(도배) — SEO 스팸이자 가독성 저하
  if (hasExcessiveRepeat(s)) issues.push('노출명 단어 반복 도배');
  return { ok: issues.length === 0, issues };
}

/**
 * 노출상품명이 **이 상품의 말**로 되어 있는가 — "다른 상품이 되어 버리는" 사고를 막는다.
 * ---------------------------------------------------------------------------
 * ⚠️ 실측(2026-08-21, 무인양품 냉수통 product_9284256050): 원본명·원본카테고리·사진이 전부
 *    냉수통인데 노출명이 "기능성 쌀 혼합곡 18곡 4kg 기능성쌀 대용량 요리용 반찬용 혼합잡곡"
 *    으로 나왔다. keywords 8개까지 ai-prompts 의 **예시(few-shot)와 글자 하나 안 틀리고 동일**
 *    — 작은 로컬 모델이 상품 대신 프롬프트 예시를 베낀 것이다. 같은 배치의 복숭아도 두 번째
 *    예시(깐마늘)를 그대로 베꼈다(11건 중 2건 = 18%).
 *    checkDisplayName 은 문법·금지어만 봐서 "완벽한 명사구인 남의 상품"을 전부 통과시켰다.
 * → 이름의 **머리 4토큰(=제품 정체)** 중 하나라도 상품 자신의 어휘(원본명·원본카테고리·특징·
 *   브랜드)와 닿아 있어야 한다. 하나도 안 닿으면 그건 다른 상품이다.
 *
 * 왜 머리 4토큰만 보나: 뒤쪽은 검색 속성어(대용량·선물용…)라 원본에 없는 게 정상이다.
 * 왜 부분일치를 허용하나: 한국어 상품명은 붙여쓰기 합성어다("레몬20과"⊃"레몬", "추희자두"⊃"추희").
 */
const GROUND_GENERIC = new Set([
  '대용량', '소용량', '선물용', '요리용', '업소용', '가정용', '세트', '정품', '무료배송',
  '신상품', '인기', '추천', '특가', '실중량', '개입', '단품', '묶음',
]);
const groundTokens = (s) => (String(s || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || [])
  .filter((t) => t.length >= 2 && !GROUND_GENERIC.has(t));

export function checkNameGrounded(name, product = {}) {
  const vocab = groundTokens([
    product.originalName || '',
    product.categoryPath || '',
    product.brand || '',
    ...(Array.isArray(product.features) ? product.features : []),
  ].join(' '));
  // 상품 쪽 어휘가 아예 없으면 판정할 근거가 없다 → 통과(다른 검사에 맡긴다).
  if (vocab.length === 0) return { ok: true, issues: [] };
  const head = groundTokens(name).slice(0, 4);
  if (head.length === 0) return { ok: true, issues: [] };
  const touches = head.some((t) => vocab.some((v) => v === t || v.includes(t) || t.includes(v)));
  return touches
    ? { ok: true, issues: [] }
    : { ok: false, issues: ['노출명이 원본 상품과 무관(다른 상품 생성 의심)'] };
}

/** 같은 토큰이 3회 이상 반복되면 도배로 본다(재생성/정리 트리거). */
function hasExcessiveRepeat(name) {
  const counts = new Map();
  for (const t of String(name || '').split(/\s+/).filter(Boolean)) {
    const k = t.replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
    if (k.length < 2) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
    if (counts.get(k) >= 3) return true;
  }
  return false;
}

/**
 * 노출상품명의 중복 토큰 제거 — 같은 검색어를 여러 번 넣어도 쿠팡 SEO 에 도움이 안 되고
 * 도배로 감점된다. 앞선 것을 유지하고 뒤 중복은 뺀다(순서 보존).
 *   실측: "…혼합곡 기타곡류 혼합곡 기타곡류 기타곡류 요리용 … 요리용잡곡".
 */
export function dedupNameTokens(name) {
  const seen = new Set();
  const out = [];
  for (const t of String(name || '').split(/\s+/).filter(Boolean)) {
    const key = t.replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
    if (!key) { out.push(t); continue; }
    if (seen.has(key)) continue;    // 정확히 같은 토큰 반복 제거
    seen.add(key);
    out.push(t);
  }
  return out.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/** 노출상품명에서 홍보/주관 형용사·부사·서술어 꼬리를 제거하고 공백·중복을 정리한다(살균 시 사용). */
export function stripNameFiller(name) {
  let s = String(name || '')
    .replace(new RegExp(RE_SEO_FILLER.source, 'gi'), ' ')
    // 문장 꼬리(서술어)·부사 토큰 제거 — 명사구만 남긴다
    .replace(/\S*(입니다|습니다|됩니다|합니다|해요|이에요|예요|드셔도|드세요|하세요|주세요|드립니다)\S*/g, ' ')
    .replace(/(정성스럽게|정성껏|안심하고|맛있게|간편하게|스럽게)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return dedupNameTokens(s);
}

/**
 * 상세페이지 품질 검사.
 * @param {string} text
 * @param {{minLen?:number}} [o]
 */
export function checkDetail(text, { minLen = 200 } = {}) {
  const s = String(text || '');
  const issues = [];
  if (s.replace(/\s/g, '').length < minLen) issues.push('상세 너무 짧음');
  if (hasForeignCJK(s)) issues.push('상세 한자/외국어 혼입');
  if (hasStructLeak(s)) issues.push('상세 JSON/태그 누출');
  if (s && koreanRatio(s) < 0.6) issues.push('상세 한글 비율 미달');
  if (RE_SEO_BANNED.test(s)) issues.push('상세 금지/과장 표현(쿠팡SEO)');
  return { ok: issues.length === 0, issues };
}

/**
 * 옵션 배열 정합성 필터.
 *   - name/value에 한자·외국어가 섞인 항목 제거(예: 材质/用途/旅行)
 *   - 같은 name 중복 제거(첫 항목 유지) — 쿠팡 옵션은 축(name)이 서로 달라야 함
 * @param {Array<{name:string,value:string,unit?:string}>} options
 * @returns {{ options:Array, dropped:number, issues:string[] }}
 */
export function sanitizeOptions(options) {
  const issues = [];
  const src = Array.isArray(options) ? options : [];
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const o of src) {
    if (!o || !o.name || !o.value) { dropped++; continue; }
    const name = String(o.name).trim();
    const value = String(o.value).trim();
    if (hasForeignCJK(name) || hasForeignCJK(value)) { dropped++; issues.push(`옵션 외국어 제거: ${name}=${value}`); continue; }
    // 이름과 값이 같은 옵션("무알콜"="무알콜")은 옵션 축이 없는 무의미 값 → 제거.
    //   실제 쿠팡 옵션은 서버(preflight-builder)가 카테고리 스키마로 재추출하므로 손실 없음.
    if (name.replace(/\s/g, '').toLowerCase() === value.replace(/\s/g, '').toLowerCase()) {
      dropped++; issues.push(`옵션 이름=값 무의미 제거: ${name}`); continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) { dropped++; issues.push(`옵션 중복명 제거: ${name}`); continue; }
    seen.add(key);
    const clean = { name, value };
    if (o.unit && !hasForeignCJK(String(o.unit))) clean.unit = String(o.unit).trim();
    out.push(clean);
  }
  return { options: out, dropped, issues };
}

/**
 * 원문에서 노출상품명 후보를 최대한 살려내는 새니타이저.
 * JSON 파싱 실패 시 원문을 그대로 저장하지 않도록 첫 유효 한국어 라인을 뽑는다.
 * @param {string} raw       LLM 원문(깨진 JSON일 수 있음)
 * @param {string} fallback  최후 폴백(보통 원본 상품명)
 */
export function salvageDisplayName(raw, fallback = '') {
  let s = String(raw || '');
  // 코드펜스/툴콜 태그/가짜 대화 이후는 버림
  s = s.replace(/```[a-z]*/gi, '').replace(/<\/?[a-z_][a-z0-9_]*>[\s\S]*$/i, '');
  // "displayName": "..." 값이 있으면 그 안의 텍스트만
  const m = s.match(/"displayName"\s*:\s*"([^"]{4,100})"/);
  if (m) s = m[1];
  // 첫 줄, 따옴표/중괄호/이모지 제거
  s = s.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^[{[]/.test(l)) || s;
  s = s.replace(/["""'{}\[\]]/g, '').replace(RE_EMOJI, '').trim();
  s = stripNameFiller(s); // 홍보/주관 형용사 제거(SEO 노이즈)
  // 한자/외국어가 섞였거나 너무 길면(원문 누출) 폴백
  if (!s || s.length < 6 || s.length > 60 || hasForeignCJK(s) || koreanRatio(s) < 0.4) {
    return String(fallback || s).slice(0, 60).trim();
  }
  return s.slice(0, 60).trim();
}
