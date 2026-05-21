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
