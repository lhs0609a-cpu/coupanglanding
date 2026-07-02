// ============================================================
// 원산지·인증 주장 자동생성 차단 (판매자 반품책임 리스크 예방)
//
// 배경: 자동 생성된 노출상품명/상세설명에 "국내산·자연산·HACCP" 같은
//   원산지/인증 주장이 근거 없이 삽입되면, 실제 원산지가 다를 경우
//   반품 요청 시 판매자 귀책(반품비 부담)이 될 수 있다.
//
// 원칙(fruit-compliance 와 동일): "주장하려면 근거를 같이."
//   - 셀러 원본(상품명/태그/설명/OCR)에 해당 주장이 이미 있으면 → 셀러가 직접 넣은 것이므로 유지
//   - 자동 생성 과정에서 새로 지어낸 주장이면 → 삭제
//
// 적용 지점: preflight-builder 의 노출상품명/등록상품명/스토리/마무리 문구.
// ============================================================

/**
 * 형용사형(전치수식) 원산지·인증 주장 — 명사 앞에서 단독으로 지워도
 * 문장이 깨지지 않는 어휘. 본문·제목 모두에서 근거 없으면 제거한다.
 */
export const ORIGIN_CLAIM_WORDS: string[] = [
  '국내산', '국산', '자연산', '자연방사',
  '유기농', '무농약', '무항생제', '친환경', '무방부제', '무첨가',
];

/**
 * 인증 명칭 — 제목(토큰 결합)에서만 안전하게 제거.
 * 본문에서는 "{인증} 인증 제품" 형태로 문장에 박혀 있어 단어만 지우면 깨지므로
 * 본문 인증 주장은 템플릿 소스에서 중화한다(여기서 제거하지 않음).
 */
export const CERT_CLAIM_WORDS: string[] = [
  'HACCP', 'GMP', '식약처', 'ISO', 'Non-GMO', 'NonGMO', '원산지증명',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupSpacing(s: string): string {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.)\]])/g, '$1')
    .replace(/([,])\s*\1+/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

/**
 * 셀러 원본 텍스트(근거)를 하나의 문자열로 합친다.
 * 이 안에 등장하는 주장만 "근거 있음"으로 인정한다.
 */
export function buildOriginEvidence(src: {
  name?: string;
  tags?: string[];
  description?: string;
  ocrSpecs?: Record<string, string>;
  certifications?: unknown;
}): string {
  return [
    src.name,
    (src.tags || []).join(' '),
    src.description,
    src.ocrSpecs ? Object.values(src.ocrSpecs).join(' ') : '',
    src.certifications ? JSON.stringify(src.certifications) : '',
  ].filter(Boolean).join('  ');
}

/**
 * 근거 없는 원산지·인증 주장을 제거한다.
 *   - evidence 에 이미 있는 주장은 유지(셀러가 직접 기입).
 *   - includeCert=true 면 인증 명칭도 제거(제목 등 토큰형 텍스트 전용).
 *
 * @param text     정제 대상 텍스트(노출상품명/스토리/마무리 등)
 * @param evidence buildOriginEvidence 결과 — 셀러 원본
 * @param opts.includeCert  인증 명칭까지 제거할지 (제목: true, 본문: false)
 */
export function sanitizeOriginClaims(
  text: string | undefined,
  evidence: string,
  opts: { includeCert?: boolean } = {},
): string {
  if (!text) return text ?? '';
  const words = opts.includeCert
    ? [...ORIGIN_CLAIM_WORDS, ...CERT_CLAIM_WORDS]
    : ORIGIN_CLAIM_WORDS;

  let s = text;
  for (const w of words) {
    // 셀러 원본에 있으면 근거 있음 → 유지
    if (evidence.includes(w)) continue;
    // 주장 단어 제거 (대소문자 무시 — HACCP 등 영문 대응).
    // 바로 뒤 "인증" literal 도 함께 제거 → "HACCP 인증" → "" (잔여 '인증' 방지)
    const re = new RegExp(escapeRegExp(w) + '(?:\\s*인증)?', 'gi');
    s = s.replace(re, ' ');
  }
  return cleanupSpacing(s);
}

/** 정제 전/후가 달라졌는지(=주장이 제거됐는지) 판정 — 로깅/디버깅용 */
export function hasUnsubstantiatedOriginClaim(text: string, evidence: string): boolean {
  return sanitizeOriginClaims(text, evidence, { includeCert: true }) !== cleanupSpacing(text);
}
