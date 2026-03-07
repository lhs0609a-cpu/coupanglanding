/**
 * 누적 상품 등록 수 기반 수수료 할인 시스템
 *
 * - seller_points.total_listings 기준
 * - 비율 할인 + 월 최대 금액 캡
 * - 정산 시 자동 적용
 */

export interface ListingDiscountTier {
  name: string;
  minListings: number;
  discountRate: number; // e.g. 0.001 = 0.1%
  monthlyCap: number;   // 월 최대 할인 금액
}

export const LISTING_DISCOUNT_TIERS: ListingDiscountTier[] = [
  { name: '마스터',   minListings: 5000, discountRate: 0.012, monthlyCap: 30000 },
  { name: '다이아',   minListings: 2000, discountRate: 0.009, monthlyCap: 24000 },
  { name: '플래티넘', minListings: 1000, discountRate: 0.007, monthlyCap: 18000 },
  { name: '골드',     minListings: 500,  discountRate: 0.005, monthlyCap: 12000 },
  { name: '실버',     minListings: 300,  discountRate: 0.003, monthlyCap: 7000 },
  { name: '브론즈',   minListings: 100,  discountRate: 0.001, monthlyCap: 3000 },
];

export interface ListingDiscountResult {
  tier: ListingDiscountTier | null;
  tierName: string | null;
  totalListings: number;
  discountRate: number;       // 적용 할인율 (e.g. 0.005 = 0.5%)
  discountRatePercent: string; // 표시용 (e.g. "0.5%")
  rawDiscountAmount: number;  // 캡 적용 전 금액
  discountAmount: number;     // 캡 적용 후 최종 할인 금액
  monthlyCap: number;         // 해당 티어 캡
  capped: boolean;            // 캡에 걸렸는지
  nextTier: ListingDiscountTier | null;
  listingsToNextTier: number; // 다음 티어까지 남은 등록 수
}

/**
 * 누적 등록 수로 현재 티어를 결정
 */
export function getListingDiscountTier(totalListings: number): ListingDiscountTier | null {
  for (const tier of LISTING_DISCOUNT_TIERS) {
    if (totalListings >= tier.minListings) {
      return tier;
    }
  }
  return null;
}

/**
 * 다음 티어 정보
 */
export function getNextTier(totalListings: number): ListingDiscountTier | null {
  const reversedTiers = [...LISTING_DISCOUNT_TIERS].reverse();
  for (const tier of reversedTiers) {
    if (totalListings < tier.minListings) {
      return tier;
    }
  }
  return null;
}

/**
 * 할인 금액 계산
 * @param totalListings - 누적 상품 등록 수 (seller_points.total_listings)
 * @param netProfit - 해당 월 순수익
 * @returns ListingDiscountResult
 */
export function calculateListingDiscount(
  totalListings: number,
  netProfit: number,
): ListingDiscountResult {
  const tier = getListingDiscountTier(totalListings);
  const nextTier = getNextTier(totalListings);

  if (!tier || netProfit <= 0) {
    return {
      tier: null,
      tierName: null,
      totalListings,
      discountRate: 0,
      discountRatePercent: '0%',
      rawDiscountAmount: 0,
      discountAmount: 0,
      monthlyCap: 0,
      capped: false,
      nextTier,
      listingsToNextTier: nextTier ? nextTier.minListings - totalListings : 0,
    };
  }

  const rawAmount = Math.floor(netProfit * tier.discountRate);
  const finalAmount = Math.min(rawAmount, tier.monthlyCap);

  return {
    tier,
    tierName: tier.name,
    totalListings,
    discountRate: tier.discountRate,
    discountRatePercent: `${(tier.discountRate * 100).toFixed(1)}%`,
    rawDiscountAmount: rawAmount,
    discountAmount: finalAmount,
    monthlyCap: tier.monthlyCap,
    capped: rawAmount > tier.monthlyCap,
    nextTier,
    listingsToNextTier: nextTier ? nextTier.minListings - totalListings : 0,
  };
}
