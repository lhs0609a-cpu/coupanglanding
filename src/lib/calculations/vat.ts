/**
 * VAT(부가가치세) 계산 함수
 *
 * 핵심 원칙:
 * - 수수료(공급가액) = 순수익 × share% (기존과 동일)
 * - VAT = 공급가액 × 10%
 * - 파트너 실납부액 = 공급가액 + VAT
 */

export const VAT_RATE = 0.1;

export interface VatCalculation {
  /** 공급가액 (수수료 = 순수익 × share%) */
  supplyAmount: number;
  /** 부가가치세 (공급가액 × 10%) */
  vatAmount: number;
  /** 합계 (공급가액 + VAT) */
  totalWithVat: number;
}

/**
 * 공급가액에 VAT를 별도 부과하여 계산
 * @param supplyAmount 공급가액 (수수료)
 * @returns VatCalculation
 */
export function calculateVatOnTop(supplyAmount: number): VatCalculation {
  if (supplyAmount <= 0) {
    return { supplyAmount: 0, vatAmount: 0, totalWithVat: 0 };
  }

  const vatAmount = Math.floor(supplyAmount * VAT_RATE);
  return {
    supplyAmount,
    vatAmount,
    totalWithVat: supplyAmount + vatAmount,
  };
}

/**
 * 세금계산서 번호 생성
 * 형식: TI-YYYYMMDD-XXXX (발행일-일련번호)
 * @param date 발행일 (기본: 오늘)
 * @param sequence 일련번호
 */
export function generateInvoiceNumber(sequence: number, date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(sequence).padStart(4, '0');
  return `TI-${dateStr}-${seq}`;
}
