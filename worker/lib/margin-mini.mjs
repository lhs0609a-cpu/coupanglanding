/**
 * 마진 판매가 계산 (워커 포트 — 웹 margin-pricing.ts 와 동일 구간)
 * 원가(소싱가) → 구간별 마진 적용 → 100원 단위 올림 판매가.
 */
// 웹 margin-pricing.ts DEFAULT_BRACKETS 와 1:1 동일(마진율 %를 분수로). rate 0.7 = 70%.
const DEFAULT_BRACKETS = [
  { max: 5000, rate: 4.5 },     // 100~5000: 450%
  { max: 10000, rate: 2.4 },    // ~10000: 240%
  { max: 20000, rate: 1.6 },    // ~20000: 160%
  { max: 30000, rate: 1.15 },   // ~30000: 115%
  { max: 50000, rate: 1.0 },    // ~50000: 100%
  { max: 80000, rate: 0.9 },    // ~80000: 90%
  { max: 150000, rate: 0.8 },   // ~150000: 80%
  { max: 200000, rate: 0.6 },   // ~200000: 60%
  { max: 300000, rate: 0.55 },  // ~300000: 55%
  { max: Infinity, rate: 0.7 }, // 300001+: 70%
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

// ── 마진율 프리셋 (웹 margin-pricing.ts 와 동일 배율) ─────────────────────────
//   rate 는 분수(0.7=70%, 4.5=450%)라 배율을 그대로 곱한다.
export const MARGIN_PRESET_FACTORS = {
  conservative3: 0.55, conservative2: 0.7, conservative1: 0.85,
  default: 1,
  aggressive1: 1.2, aggressive2: 1.45, aggressive3: 1.75,
};

/** CLI 입력(별칭/부호 포함)을 표준 프리셋 키로 해석. 모르면 null. */
export function resolveMarginLevel(s) {
  if (!s) return null;
  const k = String(s).trim().toLowerCase();
  const alias = {
    '-3': 'conservative3', 'c3': 'conservative3', 'conservative3': 'conservative3',
    '-2': 'conservative2', 'c2': 'conservative2', 'conservative2': 'conservative2',
    '-1': 'conservative1', 'c1': 'conservative1', 'conservative1': 'conservative1',
    '0': 'default', 'default': 'default', '기본': 'default',
    '+1': 'aggressive1', '1': 'aggressive1', 'a1': 'aggressive1', 'aggressive1': 'aggressive1',
    '+2': 'aggressive2', '2': 'aggressive2', 'a2': 'aggressive2', 'aggressive2': 'aggressive2',
    '+3': 'aggressive3', '3': 'aggressive3', 'a3': 'aggressive3', 'aggressive3': 'aggressive3',
  };
  return alias[k] || null;
}

/** 프리셋 배율을 기본 구간에 적용한 새 brackets 반환 */
export function presetBrackets(level, base = DEFAULT_BRACKETS) {
  const f = MARGIN_PRESET_FACTORS[level] ?? 1;
  return base.map((b) => ({ ...b, rate: +(b.rate * f).toFixed(4) }));
}
