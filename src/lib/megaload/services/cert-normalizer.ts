// ============================================================
// 인증정보 정규화 + 카테고리 메타 grounding
//
// 문제: 소싱 추출(product.json)의 인증정보는 `{name, cert_number, verify_url}`
//   형태인데, 쿠팡 등록 payload 는 `{certificationType, certificationCode}` 를 요구한다.
//   그런데 certificationType 값(enum)은 카테고리마다 다르고 추측하면 등록이 거부된다.
//
// 해결: (1) 추출 포맷을 인증번호(code)+기관으로 정규화하고,
//       (2) 소싱 라벨(`[전기용품]안전인증_국가인증 - 기관`)의 *이름*으로 타입을 고른 뒤,
//           실제 카테고리 메타(category-related-metas)가 제공하는 목록으로 검증한다.
//           → 목록에 없는 타입은 절대 보내지 않는다(타입을 우리가 만들지 않음).
//
// 안전원칙: 매칭 실패 / 인증번호를 안 받는 타입(dataType='NONE') → 그 인증은 버린다.
//           하나도 못 붙이면 missing=true (호출부가 검수 신호로 사용).
//           → 어떤 경우도 "틀린 타입을 지어내 전송"하지 않는다.
// ============================================================

import type { CertificationInfo } from './coupang-product-builder';

/** product.json 등에서 온 원본 인증(두 포맷 모두 허용) */
export interface RawCertification {
  // 소싱 추출 포맷
  name?: string;
  cert_number?: string;
  verify_url?: string;
  // 이미 쿠팡 포맷인 경우
  certificationType?: string;
  certificationCode?: string;
  certificationOrganization?: string;
}

/** 정규화된 인증(타입 미정 — grounding 전) */
export interface NormalizedCertification {
  code: string;                 // 인증번호 (예: HU071695-21012A)
  organization?: string;        // 인증기관 (예: 한국기계전기전자시험연구원장)
  rawName?: string;             // 원본 라벨 (예: [전기용품]안전인증_국가인증 - …)
  presetType?: string;          // 원본이 이미 쿠팡 타입을 가진 경우
}

/** 카테고리 메타가 제공하는 인증 (category-related-metas 의 certifications) */
export interface RequiredCertification {
  certificationType: string;
  name?: string;
  required: boolean;
  /** 'CODE' = 인증번호를 받는 타입 / 'NONE' = 번호 없음. 없으면 미상 취급. */
  dataType?: string;
}

/**
 * 원본 인증 배열 → 정규화(인증번호 있는 것만). 두 포맷 모두 처리.
 */
export function normalizeCertifications(raw: unknown): NormalizedCertification[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedCertification[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const o = c as RawCertification;
    const code = String(o.certificationCode || o.cert_number || '').trim();
    if (!code) continue;
    let organization = o.certificationOrganization;
    if (!organization && o.name && o.name.includes(' - ')) {
      organization = o.name.split(' - ').pop()?.trim();
    }
    out.push({
      code,
      organization: organization || undefined,
      rawName: o.name || undefined,
      presetType: o.certificationType || undefined,
    });
  }
  return out;
}

// ── 소싱 인증 이름 → 쿠팡 certificationType 매칭 규칙 ──────────────
//
// 소싱(스마트스토어) 인증 라벨은 `[품목군]인증구분_국가인증 - 기관` 형태다.
//   예) [전기용품]안전인증_국가인증 - 한국기계전기전자시험연구원
//       [방송통신기자재]적합인증_국가인증 - 국립전파연구원
// 아래 규칙은 그 라벨에서 타입을 고른다. 단 고른 타입은 반드시
// "해당 카테고리가 실제로 제공하는 목록" 안에 있어야 채택된다(지어내지 않음).
//
// 순서 중요: 위에서부터 첫 매치를 쓴다(구체적인 규칙이 먼저).
const CERT_TYPE_RULES: { type: string; when: RegExp }[] = [
  // 방송통신기자재 — 적합인증/적합등록/잠정인증 모두 한 타입
  { type: 'COMMUNICATION_EQUIPMENT', when: /방송통신|전파|적합인증|적합등록|적합성\s*평가/ },
  // 전기용품
  { type: 'KC_ELECTRONICS_CERTIFICATION', when: /전기용품.*안전인증/ },
  { type: 'KC_ELECTRONICS_CONFIRM', when: /전기용품.*안전확인/ },
  { type: 'KC_ELECTRONICS_PROVIDER', when: /전기용품.*공급자적합성/ },
  // 어린이제품
  { type: 'KC_KID_CERTIFICATION', when: /어린이제품.*안전인증/ },
  { type: 'KC_KID_CONFIRM', when: /어린이제품.*안전확인/ },
  { type: 'KC_KID_PROVIDER', when: /어린이제품.*공급자적합성/ },
  // 생활용품 (공급자적합성확인 = _QUALITY, 타 품목군과 접미사가 다름)
  { type: 'KC_HOUSEHOLD_CERTIFICATION', when: /생활용품.*안전인증/ },
  { type: 'KC_HOUSEHOLD_CONFIRM', when: /생활용품.*안전확인/ },
  { type: 'KC_HOUSEHOLD_QUALITY', when: /생활용품.*공급자적합성/ },
  { type: 'KC_HOUSEHOLD_PACKAGING', when: /어린이보호포장/ },
  // 기타 품목군
  { type: 'CONSUMER_CHEMICAL_PRODUCTS_AND_BIOCIDES', when: /생활화학|살생물/ },
  { type: 'KCS_MACHINERY_CERTIFICATION', when: /KCs?\s*안전인증|안전인증대상\s*기계/i },
  { type: 'KCS_MACHINERY_CONFIRM', when: /자율안전확인/ },
  { type: 'KC_SANITARY_CERTIFICATION', when: /위생안전/ },
  { type: 'KC_KITCHEN_WASTE_CERTIFICATION', when: /오물분쇄기/ },
  { type: 'KC_GAS_SUPPLY_CERTIFICATION', when: /가스용품/ },
  { type: 'KC_AUTOMOTIVE_PARTS_SELF_CERTIFICATION', when: /자동차\s*부품/ },
  { type: 'KC_WOOD_PRODUCT_CERTIFICATION', when: /목재/ },
  { type: 'KC_OCCUPATIONAL_SAFETY_AND_HEALTH_CERTIFICATION', when: /산업안전보건/ },
  { type: 'MEDICAL_DEVICE_PERMISSION', when: /의료기기\s*허가/ },
];

/** 소싱 라벨 하나 → 쿠팡 타입 후보(카테고리 제공목록 검증 전) */
export function matchCertificationType(rawName: string | undefined): string | null {
  if (!rawName) return null;
  // 기관명(' - ' 뒤)은 오탐 유발("한국기계전기전자시험연구원" → 기계/전기 오매칭) → 제거
  const label = rawName.split(' - ')[0];
  for (const rule of CERT_TYPE_RULES) {
    if (rule.when.test(label)) return rule.type;
  }
  return null;
}

/**
 * 정규화된 인증 + 카테고리 제공 인증 → 쿠팡 payload 용 certifications.
 *
 * ⚠️ 과거 구현은 "카테고리가 required=true 로 선언한 타입"에만 인증번호를 붙였는데,
 *    쿠팡은 인증을 MANDATORY 로 선언하지 않는다(실측: 전부 OPTIONAL|RECOMMEND).
 *    그래서 항상 0개가 되어 모든 상품이 NOT_REQUIRED 로 등록됐다.
 *    → 이제 소싱 라벨의 *이름*으로 타입을 고르고, 카테고리 제공목록으로 검증한다.
 *
 * 안전원칙(유지): ① 카테고리가 제공하지 않는 타입은 절대 보내지 않는다.
 *                ② 인증번호를 받지 않는 타입(dataType!=='CODE')에는 붙이지 않는다.
 *                ③ 확신이 없으면 그 인증은 버린다(틀린 칸에 번호를 넣지 않는다).
 *
 * @returns certs: 전송할 배열 / missing: 인증번호는 있는데 하나도 못 붙임(검수 신호)
 *          unmatched: 매칭 실패한 원본 라벨(로그·검수 표시용)
 */
export function groundCertifications(
  normalized: NormalizedCertification[],
  required: RequiredCertification[],
): { certs: CertificationInfo[]; missing: boolean; unmatched: string[] } {
  const offered = (required || []).filter(
    (r) => r.certificationType && r.certificationType !== 'NOT_REQUIRED',
  );
  const offeredByType = new Map(offered.map((r) => [r.certificationType, r]));
  /** dataType 미상(구버전 응답)은 막지 않는다 — 'NONE' 으로 명시된 것만 제외 */
  const acceptsCode = (t: string) => {
    const o = offeredByType.get(t);
    return !!o && (o.dataType || '').toUpperCase() !== 'NONE';
  };

  const certs: CertificationInfo[] = [];
  const unmatched: string[] = [];
  const used = new Set<string>();

  for (const n of normalized) {
    // ① 원본이 이미 쿠팡 타입을 갖고 있으면 그대로(단 카테고리 제공목록에 있어야 함)
    // ② 없으면 라벨로 매칭
    const candidate = (n.presetType && n.presetType !== 'NOT_REQUIRED')
      ? n.presetType
      : matchCertificationType(n.rawName);

    if (!candidate || !acceptsCode(candidate) || used.has(candidate)) {
      unmatched.push(n.rawName || n.code);
      continue;
    }
    used.add(candidate);
    certs.push({
      certificationType: candidate,
      certificationCode: n.code,
      ...(n.organization ? { certificationOrganization: n.organization } : {}),
    });
  }

  // 인증번호는 있는데 단 하나도 못 붙였다 → 검수 신호(등록은 NOT_REQUIRED 로 진행)
  const missing = normalized.length > 0 && certs.length === 0;
  return { certs, missing, unmatched };
}
