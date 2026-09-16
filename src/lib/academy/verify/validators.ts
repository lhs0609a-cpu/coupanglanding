/**
 * 번호 검증기 — 파일 업로드·OCR 없이 확인할 수 있는 것들.
 *
 * ★ 과장하지 않는다.
 *   체크섬이 맞다는 건 "형식이 유효한 번호" 라는 뜻이지, "이 사람이 실제로 등록했다" 는
 *   뜻이 아니다. 화면에도 그대로 적는다. 판정이 실제보다 세 보이면 그게 더 나쁘다.
 *   (국세청 상태 조회 API 를 붙이면 그때 진짜 확인으로 올라간다 — 설계도 §16-4)
 */

export interface NumberVerdict {
  valid: boolean;
  /** 저장·표시용으로 정규화한 값 (하이픈 포함) */
  normalized?: string;
  reason?: string;
}

/**
 * 사업자등록번호 10자리.
 * 국세청 체크섬: 가중치 [1,3,7,1,3,7,1,3,5] 를 앞 9자리에 곱해 더하고,
 * 9번째 자리 × 5 의 십의 자리를 한 번 더 더한 뒤, (10 - 합%10) % 10 이 마지막 자리와 같아야 한다.
 * 오타와 지어낸 번호를 걸러낸다.
 */
export function validateBizNumber(raw: string): NumberVerdict {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length !== 10) {
    return { valid: false, reason: '사업자등록번호는 숫자 10자리입니다. 입력하신 값은 ' + digits.length + '자리입니다.' };
  }
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const n = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i] * weights[i];
  sum += Math.floor((n[8] * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  if (check !== n[9]) {
    return { valid: false, reason: '사업자등록번호 형식이 올바르지 않습니다. 등록증의 번호를 다시 확인해주세요.' };
  }
  return { valid: true, normalized: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` };
}

/**
 * 통신판매업 신고번호. 체크섬이 없어 형식만 본다.
 * 예) 제 2026-서울강남-01234 호
 */
export function validateOnlineSalesNumber(raw: string): NumberVerdict {
  const s = (raw || '').trim();
  if (s.length < 8) {
    return { valid: false, reason: '신고번호가 너무 짧습니다. 신고증에 적힌 번호를 그대로 입력해주세요.' };
  }
  // 연도 4자리 + 지역명 + 일련번호 형태를 느슨하게 확인한다.
  if (!/(19|20)\d{2}\s*-\s*[가-힣A-Za-z]+\s*-\s*\d+/.test(s)) {
    return {
      valid: false,
      reason: '형식이 확인되지 않습니다. "2026-서울강남-01234" 처럼 연도-지역-번호가 들어가야 합니다.',
    };
  }
  return { valid: true, normalized: s.replace(/\s+/g, ' ') };
}

export const NUMBER_VALIDATORS = {
  bizNumber: validateBizNumber,
  onlineSalesNumber: validateOnlineSalesNumber,
} as const;

export type NumberValidatorKey = keyof typeof NUMBER_VALIDATORS;

/** 저장할 때 뒷자리를 가린다 — 판정에 필요한 건 "맞았다" 이지 번호 전체가 아니다. */
export function maskNumber(normalized: string): string {
  return normalized.replace(/\d(?=\d{0,3}$)/g, '*');
}
