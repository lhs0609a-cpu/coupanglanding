// ============================================================
// 가격대별 마진율 자동 계산 유틸리티
// ============================================================

export interface PriceBracket {
  minPrice: number;   // 이상
  maxPrice: number;   // 이하 (inclusive)
  marginRate: number; // % (예: 25 → 25%)
}

/** 기본 가격 구간 (사용자가 UI에서 수정 가능) */
export const DEFAULT_BRACKETS: PriceBracket[] = [
  { minPrice: 100,     maxPrice: 5000,      marginRate: 450 },
  { minPrice: 5001,    maxPrice: 10000,     marginRate: 240 },
  { minPrice: 10001,   maxPrice: 20000,     marginRate: 160 },
  { minPrice: 20001,   maxPrice: 30000,     marginRate: 115 },
  { minPrice: 30001,   maxPrice: 50000,     marginRate: 100 },
  { minPrice: 50001,   maxPrice: 80000,     marginRate: 90 },
  { minPrice: 80001,   maxPrice: 150000,    marginRate: 80 },
  { minPrice: 150001,  maxPrice: 200000,    marginRate: 60 },
  { minPrice: 200001,  maxPrice: 300000,    marginRate: 55 },
  { minPrice: 300001,  maxPrice: Number.MAX_SAFE_INTEGER, marginRate: 70 },
];

/**
 * 원가에 해당하는 마진율 구간을 찾아 판매가를 계산한다.
 * - 100원 단위 올림 적용
 * - 매칭되는 구간이 없으면 기본 마진율 25% 적용
 * - maxPrice는 inclusive (경계값 포함). minPrice가 다음 구간의 maxPrice+1로 정리되어 있어 중복되지 않음.
 */
export function calculateSellingPrice(
  sourcePrice: number,
  brackets: PriceBracket[] = DEFAULT_BRACKETS,
): number {
  const bracket = brackets.find(
    (b) => sourcePrice >= b.minPrice && sourcePrice <= b.maxPrice,
  );
  const marginRate = bracket ? bracket.marginRate : 25;
  const raw = sourcePrice * (1 + marginRate / 100);
  // 100원 단위 올림
  return Math.ceil(raw / 100) * 100;
}

/**
 * 마진율(%)을 반환
 */
export function getMarginRate(
  sourcePrice: number,
  brackets: PriceBracket[] = DEFAULT_BRACKETS,
): number {
  const bracket = brackets.find(
    (b) => sourcePrice >= b.minPrice && sourcePrice <= b.maxPrice,
  );
  return bracket ? bracket.marginRate : 25;
}

// ============================================================
// 마진율 프리셋 (원클릭) — 보수적(마진↓·가격경쟁력↑) ~ 공격적(마진↑·수익↑)
// 기본 구간(DEFAULT_BRACKETS)의 marginRate 에 배율을 곱해 생성한다.
// ============================================================

export type MarginPresetLevel =
  | 'conservative3' | 'conservative2' | 'conservative1'
  | 'default'
  | 'aggressive1' | 'aggressive2' | 'aggressive3';

/** 프리셋별 기본 마진율 대비 배율 */
export const MARGIN_PRESET_FACTORS: Record<MarginPresetLevel, number> = {
  conservative3: 0.55,
  conservative2: 0.7,
  conservative1: 0.85,
  default: 1,
  aggressive1: 1.2,
  aggressive2: 1.45,
  aggressive3: 1.75,
};

/** UI 표시용 프리셋 목록(보수 → 기본 → 공격 순) */
export const MARGIN_PRESETS: { level: MarginPresetLevel; label: string; tone: 'conservative' | 'default' | 'aggressive' }[] = [
  { level: 'conservative3', label: '보수 ↓↓↓', tone: 'conservative' },
  { level: 'conservative2', label: '보수 ↓↓', tone: 'conservative' },
  { level: 'conservative1', label: '보수 ↓', tone: 'conservative' },
  { level: 'default', label: '기본', tone: 'default' },
  { level: 'aggressive1', label: '공격 ↑', tone: 'aggressive' },
  { level: 'aggressive2', label: '공격 ↑↑', tone: 'aggressive' },
  { level: 'aggressive3', label: '공격 ↑↑↑', tone: 'aggressive' },
];

/** 프리셋 배율을 기본 구간에 적용한 새 brackets (marginRate 정수 반올림, 최소 1%) */
export function applyMarginPreset(
  level: MarginPresetLevel,
  base: PriceBracket[] = DEFAULT_BRACKETS,
): PriceBracket[] {
  const f = MARGIN_PRESET_FACTORS[level] ?? 1;
  return base.map((b) => ({ ...b, marginRate: Math.max(1, Math.round(b.marginRate * f)) }));
}

/** 현재 brackets 가 어떤 프리셋과 일치하는지 판별(일치 없으면 null) — UI 활성표시용.
 *  marginRate 만 비교하므로 maxPrice 가 nullable 인 변형 타입도 그대로 받는다. */
export function detectMarginPreset(
  brackets: { marginRate: number }[],
  base: PriceBracket[] = DEFAULT_BRACKETS,
): MarginPresetLevel | null {
  for (const { level } of MARGIN_PRESETS) {
    const preset = applyMarginPreset(level, base);
    if (preset.length === brackets.length
      && preset.every((p, i) => p.marginRate === brackets[i]?.marginRate)) {
      return level;
    }
  }
  return null;
}
