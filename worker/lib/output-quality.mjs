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
// 쿠팡 검색 오류 유발 특수문자
const RE_SEO_SPECIAL = /[★☆●◆■※♥♡【】《》①②③④⑤⑥▶◀→]/;

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
  if (RE_SEO_SPECIAL.test(s)) issues.push('노출명 특수문자(검색오류)');
  return { ok: issues.length === 0, issues };
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
  // 한자/외국어가 섞였거나 너무 길면(원문 누출) 폴백
  if (!s || s.length < 6 || s.length > 60 || hasForeignCJK(s) || koreanRatio(s) < 0.4) {
    return String(fallback || s).slice(0, 60).trim();
  }
  return s.slice(0, 60).trim();
}
