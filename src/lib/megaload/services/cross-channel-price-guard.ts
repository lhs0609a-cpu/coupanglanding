/**
 * 가격 정합 가드 — 역마진 + 쿠팡 최저가 정합 위반 차단
 *
 *  1) 역마진: 채널 적용가가 원가 미만 → 차단
 *  2) 쿠팡 최저가 정합: 타 채널가가 쿠팡(소스)가보다 낮으면 쿠팡 아이템위너 박탈/페널티
 *     → 차단 (마진이 음수일 때 발생)
 *
 * 위반 시 needs_input 으로 보류 → 운영자가 마진/가격 조정 후 재시도.
 */
import type { MissingField } from './canonical-product';

export function checkPriceGuard(args: {
  /** 쿠팡(소스) 판매가 — 최저가 정합 기준 */
  basePrice: number;
  /** 채널 적용가 (마진 반영) */
  adjustedPrice: number;
  costPrice: number | null;
  marginPercent: number;
}): MissingField[] {
  const missing: MissingField[] = [];

  if (args.adjustedPrice <= 0) {
    missing.push({ field: 'price', reason: '판매가가 0 이하입니다' });
    return missing;
  }

  // 1) 역마진 — 원가 미만 판매
  if (args.costPrice != null && args.costPrice > 0 && args.adjustedPrice < args.costPrice) {
    missing.push({
      field: 'price_below_cost',
      reason: `채널가(${args.adjustedPrice.toLocaleString()})가 원가(${args.costPrice.toLocaleString()}) 미만 — 역마진. 마진율을 올리세요`,
    });
  }

  // 2) 쿠팡 최저가 정합 — 타 채널이 쿠팡보다 싸지 않게
  if (args.adjustedPrice < args.basePrice) {
    missing.push({
      field: 'price_parity',
      reason: `채널가(${args.adjustedPrice.toLocaleString()})가 쿠팡가(${args.basePrice.toLocaleString()})보다 낮음 — 쿠팡 최저가 정합 위반(아이템위너 박탈 위험). 마진율을 0 이상으로`,
    });
  }

  return missing;
}
