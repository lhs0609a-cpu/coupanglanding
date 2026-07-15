// ============================================================
// 인증정보 정규화 + 카테고리 메타 grounding
//
// 문제: 소싱 추출(product.json)의 인증정보는 `{name, cert_number, verify_url}`
//   형태인데, 쿠팡 등록 payload 는 `{certificationType, certificationCode}` 를 요구한다.
//   그런데 certificationType 값(enum)은 카테고리마다 다르고 추측하면 등록이 거부된다.
//
// 해결: (1) 추출 포맷을 인증번호(code)+기관으로 정규화하고,
//       (2) 실제 카테고리 메타(category-related-metas)가 "요구하는 인증 타입"에
//           우리 인증번호를 붙인다(grounding). 타입을 우리가 만들지 않는다.
//
// 안전원칙: 카테고리가 인증을 요구하지 않으면 빈 배열(→ 빌더가 NOT_REQUIRED).
//           요구하는데 우리 인증번호가 없으면 missing=true (호출부가 보류/차단).
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

/** 카테고리 메타가 요구하는 인증 (category-related-metas 의 certifications) */
export interface RequiredCertification {
  certificationType: string;
  name?: string;
  required: boolean;
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

/** 쿠팡 required 값 정규화 (boolean | 'MANDATORY'|'REQUIRED' 등) */
function isRequired(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return /mandatory|required|필수|true/i.test(v);
  return false;
}

/**
 * 정규화된 인증 + 카테고리 요구 인증 → 쿠팡 payload 용 certifications.
 * @returns certs: 전송할 배열 / missing: 요구되나 인증번호 없음(보류 신호)
 */
export function groundCertifications(
  normalized: NormalizedCertification[],
  required: RequiredCertification[],
): { certs: CertificationInfo[]; missing: boolean } {
  const mandatory = (required || []).filter(
    (r) => r.certificationType && r.certificationType !== 'NOT_REQUIRED' && r.required,
  );

  // 카테고리가 인증을 요구하지 않음 → 원본이 이미 쿠팡 타입을 가진 것만 통과(아니면 빈 배열).
  if (mandatory.length === 0) {
    const passthrough = normalized
      .filter((n) => n.presetType && n.presetType !== 'NOT_REQUIRED')
      .map((n) => ({
        certificationType: n.presetType as string,
        certificationCode: n.code,
        ...(n.organization ? { certificationOrganization: n.organization } : {}),
      }));
    return { certs: passthrough, missing: false };
  }

  // 요구되는데 우리 인증번호가 하나도 없음 → 보류(missing). 지어내지 않는다.
  if (normalized.length === 0) return { certs: [], missing: true };

  // 요구 타입마다 우리 인증번호를 붙인다(1개면 그대로, 여러 개면 순서 매칭).
  const certs: CertificationInfo[] = mandatory.map((req, i) => {
    const src = normalized[Math.min(i, normalized.length - 1)];
    return {
      certificationType: req.certificationType,
      certificationCode: src.code,
      ...(src.organization ? { certificationOrganization: src.organization } : {}),
    };
  });
  return { certs, missing: false };
}
