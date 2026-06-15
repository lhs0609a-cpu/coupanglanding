// ============================================================
// 필수 속성/구매옵션 클라이언트 자동기입 엔진
//
// 문제: 서버 buildAttributes(coupang-product-builder.ts)는 등록 페이로드 빌드 시점에
//   모든 필수 EXPOSED 옵션을 자동으로 채운다(ENUM 첫값 / NUMBER "1{단위}" / TEXT 폴백).
//   그러나 그 자동값이 클라이언트 editedAttributeValues 에 절대 반영되지 않아, UI는 빈 값만
//   보고 "필수 미입력 — 등록 차단"으로 표시한다(거짓 차단). editedAttributeValues 를 set 하는
//   곳은 사용자 수동입력 + LLM 옵션재생성뿐이라, 평상시엔 자동 채움이 안 된다.
//
// 해결: attributeMeta(16k 카테고리 백필 캐시) 기반으로 buildAttributes 와 동일 규칙으로
//   editedAttributeValues 를 클라이언트에서 미리 채운다 → 16k 카테고리 전부 자동기입.
//
// 안전우선(사용자 결정): 중량/용량은 상품명에서 추출되면 채우고, 못 뽑으면 비워둔다.
//   (잘못된 중량/용량 자동값 = 쿠팡 "옵션 용량 오류" + 고객 클레임 → 비워서 경고 유지)
// ============================================================

export interface AutofillAttrMeta {
  attributeTypeName: string;
  required: boolean;
  dataType?: string;
  /** "EXPOSED" = 구매옵션 */
  exposed?: string;
  basicUnit?: string;
  usableUnits?: string[];
  groupNumber?: string;
  attributeValues?: { attributeValueName: string }[];
}

const WEIGHT_RE = /중량|용량|무게/;

function pickUnit(m: AutofillAttrMeta): string {
  const usable = m.usableUnits || [];
  const basic = m.basicUnit || '';
  if (usable.length > 0) return usable.includes(basic) ? basic : usable[0];
  return basic;
}

/** TEXT형 필수 속성 안전 폴백 (서버 getAttributeFallback 와 동일 취지) */
function textFallback(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('원산지') || n.includes('제조국')) return '상세페이지 참조';
  if (n.includes('브랜드')) return '자체브랜드';
  if (n.includes('모델') || n.includes('품번')) return '자체제작';
  return '상세페이지 참조';
}

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * 상품명에서 중량/용량 추출 — ★ attr 자신의 단위(usableUnits/basicUnit)만 매칭한다.
 * 일반 폴백(아무 g/ml나)을 쓰면 "100g"가 용량(ml) 필드에도 들어가는 교차오염이 생김 → 금지.
 * 단위가 안 잡히면 null(=안전우선, 비워서 경고 유지).
 */
function extractWeightForAttr(text: string, m: AutofillAttrMeta): string | null {
  const units = [...(m.usableUnits || []), m.basicUnit].filter((u): u is string => !!u);
  if (units.length === 0) return null;
  // 긴 단위 우선(예: "kg" 가 "g" 보다 먼저 매칭되도록)
  const uniq = Array.from(new Set(units)).sort((a, b) => b.length - a.length);
  for (const u of uniq) {
    // 단위 뒤에 다른 영문/한글이 붙지 않도록 경계 체크(예: "g" 가 "good" 의 g 를 잡지 않게)
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${u.replace(RE_ESCAPE, '\\$&')}(?![a-zA-Z가-힣])`, 'i');
    const mm = text.match(re);
    if (mm) return `${mm[1]}${u}`;
  }
  return null;
}

/**
 * 필수 속성 자동기입값 계산. editedAttributeValues 에 머지할 { attributeTypeName: value } 반환.
 * - 농산물 중량: 별도 경로(resolveAgriWeight)이므로 제외
 * - 중량/용량(NUMBER): 상품명에서 추출되면 채우고, 못 뽑으면 결과에서 생략(경고 유지)
 * - 그 외 전부: ENUM 첫값/키워드, 수량 등 NUMBER "1{단위}", TEXT 폴백 → 항상 채움
 */
export function computeRequiredAttrAutofill(
  product: { editedDisplayProductName?: string; name?: string },
  attributeMeta: AutofillAttrMeta[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attributeMeta?.length) return out;
  const text = `${product.editedDisplayProductName || ''} ${product.name || ''}`;

  for (const attr of attributeMeta) {
    if (!attr.required) continue;
    const name = attr.attributeTypeName;
    if (!name || name === '농산물 중량') continue;

    const allowed = (attr.attributeValues || []).map((v) => v.attributeValueName).filter(Boolean);

    // ENUM(선택형): 상품명 키워드 매칭 → 없으면 첫 허용값
    if (allowed.length > 0) {
      const matched = allowed.find((a) => a && text.includes(a));
      out[name] = matched || allowed[0];
      continue;
    }

    const isWeight = WEIGHT_RE.test(name);
    if (attr.dataType === 'NUMBER') {
      if (isWeight) {
        const v = extractWeightForAttr(text, attr);
        if (v) out[name] = v; // 못 뽑으면 생략(안전우선)
      } else {
        const unit = pickUnit(attr);
        out[name] = unit ? `1${unit}` : '1';
      }
      continue;
    }

    // TEXT/STRING/기타
    out[name] = textFallback(name);
  }
  return out;
}
