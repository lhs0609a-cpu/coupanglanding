// ============================================================
// 필수 구매옵션(EXPOSED) 값 해석 — "참조형 폴백" 차단
//
// 왜 필요한가: 쿠팡은 구매옵션 값을 **구매자에게 보이는 옵션명**으로 그대로 쓴다.
//   그래서 "상세페이지 참조" 같은 참조형 문구를 값으로 받으면 거부한다.
//     쿠팡 API 오류 (ERROR): 유효하지 않은 구매 옵션 값이 존재합니다.
//     [attrs=사료/간식 주원료="상세페이지 참조", 개당 중량="500g", 수량="1개"|category=110824]
//   (실측 2026-10-12 / 110824 강아지사료. 2026-08 토마토 72498 에서도 동일 — catalog-register.ts)
//
//   그런데 TEXT/STRING 필수 구매옵션은 빌더·클라이언트 양쪽이 값을 못 찾으면
//   getAttributeFallback()/textFallback() 로 "상세페이지 참조" 를 넣는다 → 전량 거부.
//
// 무엇을 하는가:
//   1) 참조형 플레이스홀더 판별 (isPlaceholderOptionValue)
//   2) 원본 상품정보제공고시에서 같은 뜻의 필드를 찾아 실제 값으로 해석
//      (예: "사료/간식 주원료" ← 고시 "원재료명 및 함량" = "닭고기 30%, 쌀, ..." → "닭고기")
//   값을 못 찾으면 **지어내지 않는다** — 호출측이 "검증 단계에서 직접 입력" 으로 되돌린다.
//   (없는 주원료를 임의로 찍으면 상품정보 부정확 + 식약처/쿠팡 제재 리스크)
// ============================================================

/** 쿠팡이 구매옵션 값으로 거부하는 참조형 문구 */
const PLACEHOLDER_RE =
  /상세\s*(페이지|정보|내용)?\s*(참조|참고|확인)|옵션\s*(참조|참고)|상품\s*정보\s*(참조|참고)|제품\s*설명\s*(참조|참고)|별도\s*표기|판매자\s*문의/;

/** "상세페이지 참조" 등 — 필수 구매옵션 값으로 쓰면 쿠팡이 거부하는 값인가 */
export function isPlaceholderOptionValue(value: string | undefined | null): boolean {
  const v = String(value ?? '').trim();
  if (!v || v === '-' || v === '없음' || v === '해당없음' || v === '해당 없음') return true;
  return PLACEHOLDER_RE.test(v);
}

/**
 * 해당 속성이 "자유 텍스트 필수 구매옵션" 인가 — 선택지(ENUM)도 단위(NUMBER)도 없는 것.
 *
 * exposed 가 명시적으로 'EXPOSED' 인 것만 본다. exposed 정보가 없는 옛 캐시는
 * 검색속성까지 섞여 있어(buildAttributes 레거시 분기) 여기서 건드리면 멀쩡한 등록이 막힌다.
 */
export function isFreeTextBuyOption(attr: {
  required?: boolean;
  exposed?: string;
  dataType?: string;
  attributeValues?: { attributeValueName: string }[];
}): boolean {
  if (!attr?.required) return false;
  if (attr.exposed !== 'EXPOSED') return false;
  if (Array.isArray(attr.attributeValues) && attr.attributeValues.length > 0) return false;
  const dt = String(attr.dataType || '').toUpperCase();
  return dt === 'TEXT' || dt === 'STRING';
}

/**
 * 속성명 ↔ 고시 필드명 동의어 — 이름이 글자 그대로 겹치지 않아도 같은 뜻이면 잇는다.
 * 각 쌍: [속성명 패턴, 고시 필드명 패턴]
 */
const SYNONYMS: [RegExp, RegExp][] = [
  [/원료|원재료|성분/, /원료|원재료|성분|재료/],
  [/재질|소재/, /재질|소재|원단|섬유/],
  [/원산지|제조국|생산지/, /원산지|제조국|생산지/],
  [/제조사|제조원|제조업체/, /제조사|제조원|제조업체|수입자/],
  [/형태|제형|타입/, /형태|제형|타입|종류/],
  [/맛|향/, /맛|향|풍미/],
  [/색상|컬러/, /색상|컬러/],
  [/사용\s*대상|대상\s*연령/, /사용\s*대상|대상\s*연령|적용\s*대상/],
];

function norm(s: string): string {
  return String(s || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\s·/]+/g, ' ')
    .trim();
}

/** 속성명의 핵심 토큰 — "사료/간식 주원료" → "주원료" (마지막 의미 토큰) */
function coreToken(attrName: string): string {
  const parts = norm(attrName).split(' ').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function namesMatch(attrName: string, fieldName: string): boolean {
  const a = norm(attrName);
  const f = norm(fieldName);
  if (!a || !f) return false;
  const aFlat = a.replace(/\s+/g, '');
  const fFlat = f.replace(/\s+/g, '');
  if (fFlat.length >= 2 && (aFlat.includes(fFlat) || fFlat.includes(aFlat))) return true;
  const core = coreToken(attrName).replace(/\s+/g, '');
  if (core.length >= 2 && fFlat.includes(core)) return true;
  return SYNONYMS.some(([ap, fp]) => ap.test(a) && fp.test(f));
}

/**
 * 고시 내용을 구매옵션 값으로 쓸 수 있게 다듬는다.
 * 고시는 "닭고기 30%, 쌀, 고구마, 비타민..." 처럼 목록/함량이 섞인 긴 문장인데,
 * 구매옵션 값은 구매자에게 보이는 짧은 옵션명이므로 **대표 항목 하나**만 남긴다.
 */
function condenseToOptionValue(raw: string): string {
  let v = String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 목록이면 첫 항목이 주원료(쿠팡/식약처 표기 관례: 함량 많은 순)
  v = v.split(/[,，·ㆍ|/]/)[0].trim();
  // 꼬리 함량 제거: "닭고기 30%" → "닭고기"
  v = v.replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, '').trim();
  // 끝에 남는 접속 표현 정리
  v = v.replace(/\s*(등|외)$/, '').trim();
  return v.slice(0, 25);
}

export interface NoticeField {
  name: string;
  value: string;
}

/**
 * 자유 텍스트 필수 구매옵션의 실제 값을 원본 고시에서 찾는다.
 * 못 찾으면 null — 폴백 문구를 지어내지 않는다(쿠팡이 거부하므로 의미도 없다).
 */
export function resolveBuyOptionFromNotice(
  attributeTypeName: string,
  noticeFields: NoticeField[] | undefined,
): string | null {
  if (!Array.isArray(noticeFields) || noticeFields.length === 0) return null;
  for (const f of noticeFields) {
    if (!f || !f.name || !f.value) continue;
    if (!namesMatch(attributeTypeName, f.name)) continue;
    if (isPlaceholderOptionValue(f.value)) continue;
    const v = condenseToOptionValue(f.value);
    if (v && !isPlaceholderOptionValue(v)) return v;
  }
  return null;
}
