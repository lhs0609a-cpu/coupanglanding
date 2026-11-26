/**
 * 쿠팡 "브랜드 감지" 거절 자동 복구 (셀러 WING 에 등록되지 않은 브랜드명이 노출상품명에 들어간 경우).
 * ---------------------------------------------------------------------------
 * 실측(2026-11-19): 원본 상품명의 스토어명 '농부창고' 가 쿠팡 브랜드 라이브러리(KR-97149)에 있어
 *   "[브랜드 '농부창고'이(가) 감지되었습니다. brandId 를 넣거나, 아니라면 displayProductName 을 바꿔 올리세요]"
 *   로 거절됐다. brandId 는 그 브랜드 권한이 있는 셀러만 쓸 수 있으므로, 권한이 없으면 쿠팡이 안내한
 *   두 번째 길(노출상품명에서 그 이름을 빼기)을 따른다. 어느 PC·어느 셀러 계정에서도 같은 규칙이다.
 */

// "브랜드 '농부창고'이(가) 감지되었습니다" → 농부창고
const DETECTED_BRAND_RE = /브랜드\s*'([^']+)'[^'\n]{0,12}감지/;

/** 쿠팡 거절 메시지에서 감지된 브랜드명을 뽑는다. 없으면 null. */
export function parseCoupangDetectedBrand(msg: string): string | null {
  const name = DETECTED_BRAND_RE.exec(msg || '')?.[1]?.trim();
  return name && name.length >= 2 ? name : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 이름에서 브랜드명을 전부 뺀다(대소문자·공백 차이 무시). 결과가 비면 원문을 그대로 둔다
 * (빈 노출명으로 보내느니 원문이 낫다 — 그 경우 쿠팡 거절이 그대로 보고된다).
 */
export function stripBrandFromName(name: string, brand: string): string {
  const b = brand.trim();
  if (!b) return name;
  const pattern = b.split(/\s+/).map(escapeRe).join('\\s*');
  const out = name
    .replace(new RegExp(pattern, 'gi'), ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,)\]])/g, '$1')
    .trim();
  return out.length > 0 ? out : name;
}

/**
 * 등록 페이로드의 노출상품명(displayProductName) 과 옵션 항목명(itemName)에서 브랜드명을 뺀다.
 * @returns 실제로 바뀐 곳이 있으면 true (없으면 재시도해도 같은 거절이므로 호출부가 건너뛴다)
 */
export function stripBrandFromPayload(payload: Record<string, unknown>, brand: string): boolean {
  let changed = false;
  const fix = (v: string): string => {
    const n = stripBrandFromName(v, brand);
    if (n !== v) changed = true;
    return n;
  };
  if (typeof payload.displayProductName === 'string') {
    payload.displayProductName = fix(payload.displayProductName);
  }
  for (const key of ['sellerProductItemList', 'items']) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const o = item as Record<string, unknown> | null;
      if (o && typeof o.itemName === 'string') o.itemName = fix(o.itemName);
    }
  }
  return changed;
}
