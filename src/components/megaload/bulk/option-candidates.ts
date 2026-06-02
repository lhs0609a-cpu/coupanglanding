/**
 * 클라이언트용 다변량(택1) 중량 후보 계산 — 서버 option-extractor 의 detectVariantAmbiguity 와 동일 규칙.
 * 상품명에 서로 다른 kg 값이 2개 이상이면 후보 배열을 반환(택1 필요), 아니면 빈 배열.
 */
export const AGRI_WEIGHT_OPTION = '농산물 중량';
export const REFER_DETAIL = '상세페이지 참조';

export function detectWeightCandidates(name: string): string[] {
  if (!name) return [];
  const normalized = name.replace(/(\d),(\d{1,2})(?=\s*(?:kg|KG|㎏))/g, '$1.$2');
  const kgRe = /(\d+(?:\.\d+)?)\s*(?:kg|KG|㎏)(?!\s*[xX×]\s*\d)/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = kgRe.exec(normalized)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0) set.add(`${v}kg`);
  }
  return set.size >= 2 ? [...set].sort((a, b) => parseFloat(a) - parseFloat(b)) : [];
}

/**
 * 상품명에서 발견되는 모든 중량 토큰(kg/g)을 distinct 하게 반환 — 칩/프리필용.
 * detectWeightCandidates 와 달리 1개여도 반환한다 (단일 중량 자동 확정에 사용).
 */
export function detectAllWeights(name: string): string[] {
  if (!name) return [];
  const normalized = name.replace(/(\d),(\d{1,2})(?=\s*(?:kg|KG|㎏))/g, '$1.$2');
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: string) => { if (!seen.has(v)) { seen.add(v); out.push(v); } };
  const kgRe = /(\d+(?:\.\d+)?)\s*(?:kg|KG|㎏)(?!\s*[xX×]\s*\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = kgRe.exec(normalized)) !== null) {
    const v = parseFloat(m[1]); if (v > 0) push(`${v}kg`);
  }
  // g 는 "kg" 의 g 와 겹치지 않도록 숫자가 바로 앞에 오는 경우만 (5kg 의 g 는 앞이 'k')
  const gRe = /(\d{2,5})\s*(?:g|G|그램|그람)(?![a-zA-Z가-힣])(?!\s*[xX×]\s*\d)/g;
  while ((m = gRe.exec(normalized)) !== null) {
    const v = parseFloat(m[1]); if (v > 0) push(`${v}g`);
  }
  return out;
}

/**
 * 농산물/신선식품(중량 옵션 필수) 카테고리인지 판단. 가공식품/음료 등은 제외(오탐 방지).
 * categoryName 은 path 문자열 (예: "식품>신선식품>과일류>과일>사과").
 */
export function isAgriProduct(categoryName?: string): boolean {
  if (!categoryName) return false;
  if (/가공|건강식품|음료|주스|즙|차류|커피|과자|스낵|통조림|즉석|소스|장류|조미료/.test(categoryName)) return false;
  return /(신선식품|농산물|농산|과일|채소|쌀|잡곡|나물|버섯|수산물|축산물)/.test(categoryName);
}

/**
 * 농산물 중량 옵션의 최종 등록값을 확정한다.
 * - 사용자가 고른 실제 중량(picked, "5kg") → 그대로 사용
 * - picked 없고 노출명/원본명에 중량이 정확히 1개 → 그 값으로 자동 확정
 * - 모호(2개 이상)/없음/"상세페이지 참조" → undefined (미해결 → 등록 차단 대상)
 */
export function resolveAgriWeight(
  displayName: string | undefined,
  sourceName: string | undefined,
  picked: string | undefined,
): string | undefined {
  if (picked && picked !== REFER_DETAIL) return picked;
  if (picked === REFER_DETAIL) return undefined;
  const fromDisplay = detectAllWeights(displayName || '');
  const cands = fromDisplay.length ? fromDisplay : detectAllWeights(sourceName || '');
  return cands.length === 1 ? cands[0] : undefined;
}

/**
 * 택1 dropdown 선택 시 노출상품명 꼬리 spec을 picked 값으로 재동기화한다.
 * 서버 display-name-generator.ts 의 syncDisplayNameWithOptions 와 같은 stripRegex 사용 →
 * 서버/클라 결과가 일관되어 검수 화면과 등록 결과가 미스매치 나지 않는다.
 *
 * - picked = "8kg"     → "... 신선한 8kg, 1개"
 * - picked = REFER_DETAIL | "" → 꼬리 spec 통째 제거 (숫자 없는 placeholder는 제목에 안 박음)
 */
const TAIL_SPEC_STRIP_RE =
  /(?:\s|,)*(?:\d+(?:[.,]\d+)?\s*(?:개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개(?!입|월|년)|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)[,\s]*)+$/i;

export function rewriteDisplayNameForPickedWeight(displayName: string, picked: string): string {
  if (!displayName) return displayName;
  let stripped = displayName.replace(TAIL_SPEC_STRIP_RE, '').trim();
  // 한글 콤마 decimal(2,)이나 콤마만 남은 잔여 제거
  stripped = stripped.replace(/[,\s]*\d{1,3}\s*,?\s*$/, '').trim();
  // HARD_MAX_CHARS(70) 안전마진 — picked + ", 1개" 6~10자 추가됨
  if (!picked || picked === REFER_DETAIL) {
    return stripped.length > 70 ? stripped.slice(0, 70) : stripped;
  }
  const next = `${stripped} ${picked}, 1개`;
  return next.length > 70 ? next.slice(0, 70) : next;
}
