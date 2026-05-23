/**
 * 마진 판매가 계산 (워커 포트 — 웹 margin-pricing.ts 와 동일 구간)
 * 원가(소싱가) → 구간별 마진 적용 → 100원 단위 올림 판매가.
 */
const DEFAULT_BRACKETS = [
  { max: 5000, rate: 4.5 },
  { max: 10000, rate: 2.4 },
  { max: 30000, rate: 1.5 },
  { max: 50000, rate: 1.1 },
  { max: 100000, rate: 0.9 },
  { max: 300000, rate: 0.8 },
  { max: Infinity, rate: 0.7 },
];

export function getMarginRate(sourcePrice, brackets = DEFAULT_BRACKETS) {
  for (const b of brackets) if (sourcePrice <= b.max) return b.rate;
  return brackets[brackets.length - 1].rate;
}

/** 판매가 = 원가 × (1 + 마진율), 100원 올림. sourcePrice 없으면 null. */
export function calculateSellingPrice(sourcePrice, brackets = DEFAULT_BRACKETS) {
  const p = Number(sourcePrice);
  if (!Number.isFinite(p) || p <= 0) return null;
  const rate = getMarginRate(p, brackets);
  return Math.ceil((p * (1 + rate)) / 100) * 100;
}
