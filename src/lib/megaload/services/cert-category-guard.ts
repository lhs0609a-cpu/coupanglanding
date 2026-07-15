/**
 * 인증/자격 필요 카테고리 가드 — 위법 리스팅 자동등록 차단
 *
 * 전기용품 KC, 어린이제품 안전인증, 화장품 책임판매업, 식품 영업신고, 의료기기 신고 등
 * 자격/인증 없이 자동등록하면 삭제+페널티+법적책임. 의심되면 needs_input(cert_required)로
 * 보류 → 운영자가 "이 인증 보유 확인"(ack) 하면 그 카테고리는 이후 자동 흐름.
 *
 * ⚠️ 보수적(의심 시 차단). 키워드 기반이라 오탐 가능 → 그래서 운영자 ack 로 1회 해제.
 */
import type { CanonicalProduct, MissingField } from './canonical-product';

export interface CertRule {
  label: string;
  pattern: RegExp;
}

/** 라벨은 megaload_users.cert_acknowledged 에 저장되는 키이기도 하다(변경 시 마이그레이션 고려). */
export const CERT_RULES: CertRule[] = [
  { label: '전기용품 KC 인증', pattern: /전기|충전기|어댑터|콘센트|멀티탭|전선|전동|히터|전기장판|전기방석|인덕션|전기포트|안마의자|안마기|마사지건|마사지기|안마|마사지|발마사지|목마사지|가습기|제습기|선풍기|서큘레이터|공기청정기|드라이어|고데기|전기면도기|믹서기|블렌더|전기밥솥|토스터|커피머신|에어프라이어|전기주전자|다리미|스팀다리미|청소기|온수매트|전기매트|족욕기|안마쿠션/i },
  { label: '어린이제품 안전인증', pattern: /유아|아기|어린이|완구|장난감|유모차|카시트|보행기|젖병|아동/i },
  { label: '화장품 책임판매업', pattern: /화장품|스킨|로션|에센스|세럼|선크림|선블록|클렌징|토너|마스크팩|쿠션|파운데이션|립스틱|앰플|아이크림/i },
  { label: '식품 영업신고', pattern: /식품|건강기능|영양제|비타민|홍삼|프로바이오틱|유산균|단백질보충|다이어트보조|콜라겐/i },
  { label: '의료기기 신고', pattern: /의료기기|혈압계|체온계|보청기|콘택트렌즈|찜질기|네뷸라이저|혈당측정/i },
  { label: '생활화학제품 안전기준', pattern: /세제|살균|살충|방향제|탈취|표백|섬유유연|세정제|곰팡이제거/i },
];

/**
 * 인증 필요 카테고리로 의심되며 ack 안 된 경우 needs_input 반환.
 * @param acknowledged megaload_users.cert_acknowledged (운영자가 보유 확인한 라벨)
 */
export function checkCertRequired(
  product: CanonicalProduct,
  acknowledged: string[] = [],
): MissingField[] {
  const ack = new Set(acknowledged);
  const hay = `${product.name} ${product.displayName || ''} ${product.brand || ''}`;
  for (const rule of CERT_RULES) {
    if (rule.pattern.test(hay) && !ack.has(rule.label)) {
      return [{
        field: 'cert_required',
        reason: `'${rule.label}' 대상으로 의심됩니다 — 자격/인증 확인 후 해제하세요 (자동등록 차단)`,
      }];
    }
  }
  return [];
}

/** 상품에 매칭되는 인증 라벨(예외큐에서 ack 버튼 노출용). */
export function matchedCertLabel(product: CanonicalProduct): string | null {
  const hay = `${product.name} ${product.displayName || ''} ${product.brand || ''}`;
  for (const rule of CERT_RULES) {
    if (rule.pattern.test(hay)) return rule.label;
  }
  return null;
}
