// ============================================================
// 인증 grounding 회귀 하니스
//   실행: npx tsx scripts/verify-cert-grounding.ts
//
// 아래 OFFERED 는 쿠팡 category-related-metas 의 certifications 실측 스냅샷이다.
// 전 카테고리 전수 조사(16,259개) 결과 **모든 카테고리가 동일한 27종**을 제공하며,
// required 가 MANDATORY 인 카테고리는 0건이다. 그래서 카테고리별 분기가 필요 없다.
//
// 핵심 불변식:
//   ① dataType='NONE'(번호칸 없는 체크박스형)에는 절대 인증번호를 싣지 않는다.
//   ② 쿠팡이 제공하지 않는 인증(HACCP·할랄 등)은 조용히 버린다 — 넣을 칸이 없다.
//   ③ 소싱 라벨로만 타입을 고른다(상품명/카테고리 추론 금지).
// ============================================================

import { normalizeCertifications, groundCertifications, looksLikeCodeCertification } from '../src/lib/megaload/services/cert-normalizer';

const OFFERED = [
  ['NOT_REQUIRED', '인증대상아님', 'NONE'],
  ['PRESENTED_IN_DETAIL_PAGE', '상세설명에 표시', 'NONE'],
  ['PURCHASED_WITHOUT_KC_MARK', 'KC마크 없이 구매대행 가능한 품목', 'NONE'],
  ['KC_KID_CERTIFICATION', 'KC인증 어린이제품 안전인증', 'CODE'],
  ['KC_KID_CONFIRM', 'KC인증 어린이제품 안전확인', 'CODE'],
  ['KC_KID_PROVIDER', 'KC인증 어린이제품 공급자적합성확인', 'NONE'],
  ['KC_ELECTRONICS_CERTIFICATION', 'KC인증 전기용품 안전인증', 'CODE'],
  ['KC_ELECTRONICS_CONFIRM', 'KC인증 전기용품 안전확인', 'CODE'],
  ['KC_ELECTRONICS_PROVIDER', 'KC인증 전기용품 공급자적합성확인', 'NONE'],
  ['KC_HOUSEHOLD_CERTIFICATION', 'KC인증 생활용품 안전인증', 'CODE'],
  ['KC_HOUSEHOLD_CONFIRM', 'KC인증 생활용품 안전확인', 'CODE'],
  ['KC_HOUSEHOLD_QUALITY', 'KC인증 생활용품 공급자적합성확인', 'NONE'],
  ['KC_HOUSEHOLD_PACKAGING', 'KC인증 생활용품 어린이보호포장', 'NONE'],
  ['COMMUNICATION_EQUIPMENT', '방송통신기자재 적합성 평가 대상', 'CODE'],
  ['CONSUMER_CHEMICAL_PRODUCTS_AND_BIOCIDES', '생활화학제품 및 살생물제 관련 제품', 'CODE'],
  ['KCS_MACHINERY_CERTIFICATION', '[KCs 안전인증] 안전인증대상 기계∙기구 등', 'CODE'],
  ['KCS_MACHINERY_CONFIRM', '[KCs 자율안전확인신고] 자율안전확인대상 기계∙기구 등', 'CODE'],
  ['ORGANIC_ECOFRIENDLY_CONFIRM', '유기농/친환경', 'NONE'],
  ['KC_SANITARY_CERTIFICATION', '위생안전기준인증', 'NONE'],
  ['KC_KITCHEN_WASTE_CERTIFICATION', '주방용오물분쇄기인증', 'NONE'],
  ['MEDICAL_DEVICE_AD_REVIEW', '의료기기광고심의서', 'NONE'],
  ['MEDICAL_DEVICE_PERMISSION', '의료기기 허가', 'NONE'],
  ['MOBILE_DEVICE_DEALER_PERMIT', '이동통신 사전승낙서', 'NONE'],
  ['KC_AUTOMOTIVE_PARTS_SELF_CERTIFICATION', '자동차 부품 자기 인증', 'NONE'],
  ['KC_GAS_SUPPLY_CERTIFICATION', '가스용품필증', 'NONE'],
  ['KC_OCCUPATIONAL_SAFETY_AND_HEALTH_CERTIFICATION', '산업안전보건 인증', 'NONE'],
  ['KC_WOOD_PRODUCT_CERTIFICATION', '목재 제품 인증', 'NONE'],
].map(([certificationType, name, dataType]) => ({ certificationType, name, dataType, required: false }));

type Expect = 'code' | 'checkbox' | 'drop';
const CASES: { label: string; code: string; expect: Expect; note?: string }[] = [
  { label: '[친환경]유기농산물_국가인증 - ECOCERT', code: 'KR-ORG-001', expect: 'checkbox', note: '오일 사례' },
  { label: '[무농약]농산물_국가인증 - 국립농산물품질관리원', code: 'NO-PEST-3', expect: 'checkbox' },
  { label: '[전기용품]안전인증_국가인증 - 한국기계전기전자시험연구원', code: 'HU071695-21012A', expect: 'code' },
  { label: '[전기용품]안전확인_국가인증 - 한국산업기술시험원', code: 'YU10128-23004', expect: 'code' },
  { label: '[전기용품]공급자적합성확인_국가인증 - 자체', code: 'ABC-123', expect: 'checkbox' },
  { label: '[어린이제품]공급자적합성확인_국가인증 - 자체', code: 'KID-9', expect: 'checkbox' },
  { label: '[생활용품]공급자적합성확인_국가인증 - 자체', code: 'HH-7', expect: 'checkbox' },
  { label: '[생활용품]안전확인_국가인증 - KTR', code: 'CB0123-4567', expect: 'code' },
  { label: '[방송통신기자재]적합등록_국가인증 - 국립전파연구원', code: 'R-R-abc-1234', expect: 'code' },
  { label: '위생안전기준인증 - 한국물기술인증원', code: 'W-2024-1', expect: 'checkbox' },
  { label: '의료기기 허가 - 식약처', code: '제허 20-1호', expect: 'checkbox' },
  { label: '의료기기 광고심의 - 의료기기산업협회', code: '심의2024-1', expect: 'checkbox', note: '허가보다 먼저 매칭돼야 함' },
  { label: '[식품]HACCP_국가인증 - 식약처', code: 'H-1234', expect: 'drop', note: '쿠팡에 항목 없음' },
  { label: '할랄인증 - JAKIM', code: 'HAL-1', expect: 'drop', note: '쿠팡에 항목 없음' },
];

let pass = 0;
let fail = 0;
const check = (ok: boolean, msg: string) => { if (ok) { pass++; } else { fail++; } console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); };

for (const c of CASES) {
  const normalized = normalizeCertifications([{ name: c.label, cert_number: c.code }]);
  const { certs, grounded } = groundCertifications(normalized, OFFERED);
  const actual: Expect = grounded.length === 0 ? 'drop' : (grounded[0].checkboxOnly ? 'checkbox' : 'code');
  // 불변식 ①: 체크박스형에 번호가 새어나가면 안 된다
  const leaked = grounded.some((g, i) => g.checkboxOnly && certs[i].certificationCode !== '');
  check(actual === c.expect && !leaked,
    `[기대 ${c.expect} → 실제 ${actual}]${leaked ? ' ⚠️번호유출' : ''} ${c.label}${c.note ? `  (${c.note})` : ''}`
    + `  payload=${JSON.stringify(certs)}`);
}

// 혼합: 번호형 + 체크박스형 + 대응없음 이 동시에 들어오는 경우
const mixed = groundCertifications(normalizeCertifications([
  { name: '[전기용품]안전인증_국가인증 - KTC', cert_number: 'AAA-1' },
  { name: '[친환경]유기농산물_국가인증 - ECOCERT', cert_number: 'ORG-2' },
  { name: '[식품]HACCP_국가인증 - 식약처', cert_number: 'H-3' },
]), OFFERED);
check(
  mixed.certs.length === 2 && mixed.unmatched.length === 1 && !mixed.missing
  && mixed.certs.find((c) => c.certificationType === 'ORGANIC_ECOFRIENDLY_CONFIRM')?.certificationCode === ''
  && mixed.certs.find((c) => c.certificationType === 'KC_ELECTRONICS_CERTIFICATION')?.certificationCode === 'AAA-1',
  `혼합(번호+체크박스+대응없음) payload=${JSON.stringify(mixed.certs)} unmatched=${mixed.unmatched.length} missing=${mixed.missing}`,
);

// 회귀: 인증이 전혀 없으면 아무것도 붙지 않는다(빌더가 NOT_REQUIRED 폴백)
const empty = groundCertifications(normalizeCertifications([]), OFFERED);
check(empty.certs.length === 0 && !empty.missing, `인증 없음 → certs=0, missing=false (NOT_REQUIRED 폴백 유지)`);

// ── 경고 억제: 사용자가 조치할 수 없는 누락은 경고로 올리지 않는다 ──
//   쿠팡에 칸이 없는 인증(HACCP·할랄)만 있으면 윙에서도 넣을 데가 없다 → 경고 X
const onlyUnsupported = groundCertifications(normalizeCertifications([
  { name: '[식품]HACCP_국가인증 - 식약처', cert_number: 'H-3' },
  { name: '할랄인증 - JAKIM', cert_number: 'HAL-1' },
]), OFFERED);
check(
  !onlyUnsupported.missing && onlyUnsupported.actionable.length === 0 && onlyUnsupported.unsupported.length === 2,
  `쿠팡 미제공 인증만 → 경고 없음 (missing=${onlyUnsupported.missing}, actionable=${onlyUnsupported.actionable.length}, unsupported=${onlyUnsupported.unsupported.length})`,
);

// 반대로 쿠팡에 번호칸이 있는 계열인데 못 붙였으면 = 룰 갭 → 반드시 경고
const ruleGap = groundCertifications(normalizeCertifications([
  { name: '안전인증대상제품 안전인증 - 미상기관', cert_number: 'XX-1' },
]), OFFERED);
check(
  ruleGap.actionable.length === 1 && ruleGap.missing,
  `번호칸 있는 계열 누락(룰 갭) → 경고 유지 (actionable=${ruleGap.actionable.length}, missing=${ruleGap.missing})`,
);

// 공급자적합성확인은 '적합'을 포함하지만 번호칸이 없다 → 조치 가능으로 오분류되면 안 된다
//   (정상 경로에선 체크박스로 붙지만, 오탐 방지 자체를 잠근다)
check(
  !looksLikeCodeCertification('[전기용품]공급자적합성확인_국가인증 - 자체'),
  `'공급자적합성확인'을 번호칸 계열로 오판하지 않음`,
);

// 체크박스형만 붙은 경우 = 완전 정상 → 경고 0
const checkboxOnlyCase = groundCertifications(normalizeCertifications([
  { name: '[친환경]유기농산물_국가인증 - ECOCERT', cert_number: 'KR-ORG-001' },
]), OFFERED);
check(
  !checkboxOnlyCase.missing && checkboxOnlyCase.actionable.length === 0 && checkboxOnlyCase.certs.length === 1,
  `체크박스형만 → 경고 0, payload 1건 (오일 사례가 조용히 통과)`,
);

console.log(`\n== ${pass} pass / ${fail} fail ==`);
process.exit(fail > 0 ? 1 : 0);
