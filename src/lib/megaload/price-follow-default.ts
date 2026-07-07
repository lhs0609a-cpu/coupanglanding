import type { PriceFollowRule } from '@/lib/supabase/types';

/**
 * 품절동기화 가격 자동추종 기본값.
 *
 * 사용자가 상품별로 규칙을 따로 설정하지 않아도(= price_follow_rule 이 null),
 * 원본가가 오르내리면 우리 쿠팡 판매가가 자동으로 따라 움직인다.
 *
 * - type: 'fixed_margin' → 현재 "우리가 − 원본가" 마진을 첫 사이클에 캡처하고,
 *   그 마진을 유지한 채 원본가 변동을 추종한다. (첫 사이클은 가격 변경 없이 마진만 캡처)
 * - mode: 'auto' → 사람 확인 없이 즉시 쿠팡에 반영.
 * - 가드레일: 1% 미만 변동 무시, 30% 초과 급변동은 자동 반영하지 않고 승인 대기로 보류,
 *   쿨다운 60분(플래핑 방지), 하락도 추종.
 *
 * 사용자가 모달에서 명시적으로 { enabled: false } 로 저장하면 그 상품은 추종하지 않는다
 * (null = 기본 자동, 명시적 비활성 = 존중).
 */
export const DEFAULT_PRICE_FOLLOW_RULE: PriceFollowRule = {
  enabled: true,
  mode: 'auto',
  type: 'fixed_margin',
  min_change_pct: 1,
  max_change_pct: 30,
  follow_down: true,
  cooldown_minutes: 60,
};

/** 모니터의 유효 규칙 — 명시적 규칙이 없으면 기본 자동추종 규칙을 적용. */
export function effectivePriceFollowRule(rule: PriceFollowRule | null | undefined): PriceFollowRule {
  return rule ?? DEFAULT_PRICE_FOLLOW_RULE;
}
