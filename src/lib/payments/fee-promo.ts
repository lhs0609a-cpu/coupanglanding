/**
 * 한시 수수료 할인 프로모션 — 단일 출처.
 *
 * 정책: **매출월(year_month) 단위로 지정**. 결제 시점이 아니라 매출월로 판정한다.
 *   - 결제일 조건(예: "10월 3일에 결제한 건만")으로 하면 카드 실패 후 재시도(D+1~D+3)나
 *     관리자 즉시청구 타이밍에 따라 같은 달 매출인데 사람마다 할인이 갈린다.
 *   - 매출월 기준이면 리포트가 언제 생성·결제되든 금액이 동일하고, 지정 안 한 달은
 *     자동으로 원래 요율로 돌아간다(= 프로모션 해제 작업이 필요 없음).
 *
 * 현재 지정: 2026-09 매출분(2026-10-03 청구 사이클) 공급가액 10% 할인.
 *   → 2026-10 매출분(11/3 청구)부터는 FEE_PROMO_YEAR_MONTHS 에 없으므로 자동으로 정상 요율.
 *
 * 할인은 **공급가액(수수료)에만** 적용하고 VAT 는 할인 후 공급가액의 10% 로 다시 계산한다.
 * 연체 가산금(fee_surcharge_amount/fee_interest_amount)은 할인 대상이 아니다.
 *
 * ⚠️ 금액을 계산·재계산하는 모든 지점이 이 모듈을 거쳐야 한다. 한 곳이라도 빠지면
 *    그 경로로 저장된 리포트만 할인 없이 청구되고, 세금계산서도 그 금액으로 발행된다.
 *    (현재 적용 지점: billable-reports / monthly-report-auto-create / ad-cost approve /
 *     share-percentage 재계산 / my/report 직접보고)
 */
import { calculateVatOnTop } from '@/lib/calculations/vat';
import type { VatCalculation } from '@/lib/calculations/vat';

/** 할인 대상 매출월. 비우면 프로모션 없음. */
export const FEE_PROMO_YEAR_MONTHS: readonly string[] = ['2026-09'];

/** 공급가액 할인율 (0.10 = 10%) */
export const FEE_PROMO_RATE = 0.1;

/** 알림·UI 표기용 라벨 */
export const FEE_PROMO_LABEL = '한시 수수료 10% 할인';

/** 해당 매출월에 적용되는 할인율 (없으면 0) */
export function getFeePromoRate(yearMonth: string | null | undefined): number {
  if (!yearMonth) return 0;
  return FEE_PROMO_YEAR_MONTHS.includes(yearMonth) ? FEE_PROMO_RATE : 0;
}

export interface FeePromoResult {
  /** 할인 적용 후 공급가액 (= 청구 기준) */
  supplyAmount: number;
  /** 할인 금액 (원래 공급가액 − 할인 후) */
  discountAmount: number;
  /** 적용된 할인율 (미적용 시 0) */
  rate: number;
  /** 할인이 실제로 적용됐는지 */
  applied: boolean;
}

/**
 * 공급가액에 프로모션 할인 적용.
 * @param supplyAmount 할인 전 공급가액 (순수익 × share%, 상품등록 할인 등 기존 차감까지 끝난 값)
 * @param yearMonth 매출월 'YYYY-MM'
 */
export function applyFeePromo(supplyAmount: number, yearMonth: string | null | undefined): FeePromoResult {
  const rate = getFeePromoRate(yearMonth);
  if (rate <= 0 || supplyAmount <= 0) {
    return { supplyAmount: Math.max(0, supplyAmount), discountAmount: 0, rate: 0, applied: false };
  }
  // 내림 — 사업자가 아니라 PT생에게 유리한 방향으로 절사
  const discounted = Math.floor(supplyAmount * (1 - rate));
  return {
    supplyAmount: discounted,
    discountAmount: supplyAmount - discounted,
    rate,
    applied: true,
  };
}

/**
 * 공급가액 → (할인 적용) → VAT 포함 청구액까지 한 번에.
 * 호출부가 할인 적용을 잊고 calculateVatOnTop 을 직접 쓰는 사고를 막기 위한 래퍼.
 */
export function calculatePromoVat(
  supplyAmount: number,
  yearMonth: string | null | undefined,
): { promo: FeePromoResult; vat: VatCalculation } {
  const promo = applyFeePromo(supplyAmount, yearMonth);
  return { promo, vat: calculateVatOnTop(promo.supplyAmount) };
}
