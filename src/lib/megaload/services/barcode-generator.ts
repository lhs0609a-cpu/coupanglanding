// ============================================================
// EAN-13 바코드 생성기
// 셀러+상품 조합으로 결정적(deterministic) 바코드를 생성한다.
// GS1 내부용 접두사 200을 사용하여 실제 제조사 코드와 충돌을 방지.
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';

/**
 * EAN-13 체크디짓 계산 (GS1 표준 Modulo 10)
 */
function calcCheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits12[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * 셀러+상품 조합으로 유효한 EAN-13 바코드를 생성
 *
 * - 접두사 200 (GS1 내부용 범위 — 실제 제조사 코드와 충돌 없음)
 * - 동일 sellerSeed + productCode = 항상 동일 바코드 (결정적)
 * - 다른 sellerSeed + 같은 productCode = 다른 바코드
 *
 * @param sellerSeed 셀러 고유 시드 (예: shUserId)
 * @param productCode 상품 코드 (예: "001" 또는 "001_0")
 * @returns 13자리 EAN-13 문자열
 */
export function generateEAN13(sellerSeed: string, productCode: string): string {
  const seed = stringToSeed(`${sellerSeed}:barcode:${productCode}`);
  const rng = createSeededRandom(seed);

  // 접두사 200 (3자리) + 랜덤 9자리 = 12자리 → 체크디짓 1자리 = 13자리
  let digits = '200';
  for (let i = 0; i < 9; i++) {
    digits += Math.floor(rng() * 10).toString();
  }

  const check = calcCheckDigit(digits);
  return digits + check.toString();
}
