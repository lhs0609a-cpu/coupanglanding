import { TAX_BRACKETS } from '@/lib/utils/constants';

/**
 * 종합소득세 계산
 * @param annualIncome 연간 소득 (원)
 * @returns { incomeTax, localTax, totalTax }
 */
export function calculateTax(annualIncome: number) {
  if (annualIncome <= 0) {
    return { incomeTax: 0, localTax: 0, totalTax: 0 };
  }

  let incomeTax = 0;

  for (const bracket of TAX_BRACKETS) {
    if (annualIncome <= bracket.limit) {
      incomeTax = annualIncome * bracket.rate - bracket.deduction;
      break;
    }
  }

  incomeTax = Math.floor(Math.max(0, incomeTax));
  const localTax = Math.floor(incomeTax * 0.1); // 지방소득세 10%
  const totalTax = incomeTax + localTax;

  return { incomeTax, localTax, totalTax };
}

/**
 * 월 소득으로 연간 예상 세금 계산
 */
export function estimateAnnualTax(monthlyIncome: number) {
  return calculateTax(monthlyIncome * 12);
}
