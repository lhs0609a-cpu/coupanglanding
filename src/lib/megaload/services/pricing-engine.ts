import { getCnyKrwRate } from '../adapters/exchange-rate';
import { CHANNEL_COMMISSION_RATES } from '../constants';
import type { Channel } from '../types';

export interface PricingInput {
  costCny: number;
  exchangeRate?: number;
  exchangeRateBuffer?: number; // %
  marginRate: number; // %
  domesticShippingFee?: number;
  internationalShippingFee?: number;
  customsRate?: number; // %
  vatRate?: number; // %
  channel: Channel;
  sellType: 'dropshipping' | 'wholesale';
  weightGram?: number;
  quantity?: number;
}

export interface PricingResult {
  costKrw: number;
  shippingFee: number;
  customsDuty: number;
  vat: number;
  totalCost: number;
  margin: number;
  channelCommission: number;
  salePrice: number;
  netProfit: number;
  profitRate: number;
  isSimpleClearance: boolean;
}

export async function calculateSalePrice(input: PricingInput): Promise<PricingResult> {
  const {
    costCny,
    exchangeRateBuffer = 3,
    marginRate,
    domesticShippingFee = 0,
    internationalShippingFee = 0,
    customsRate = 0,
    vatRate = 10,
    channel,
    sellType,
    quantity = 1,
  } = input;

  // 환율
  let exchangeRate = input.exchangeRate;
  if (!exchangeRate) {
    const rateData = await getCnyKrwRate();
    exchangeRate = rateData.rate;
  }
  const bufferedRate = exchangeRate * (1 + exchangeRateBuffer / 100);

  // 원가 (KRW)
  const costKrw = Math.round(costCny * bufferedRate * quantity);

  // 목록통관 자동 판별 ($150 이하)
  const costUsd = costCny * bufferedRate / 1350; // 대략적 USD 환산
  const isSimpleClearance = costUsd <= 150;

  // 배송비
  const shippingFee = sellType === 'dropshipping'
    ? internationalShippingFee
    : domesticShippingFee;

  // 관부가세
  const customsDuty = isSimpleClearance ? 0 : Math.round(costKrw * (customsRate / 100));
  const vatBase = costKrw + customsDuty;
  const vat = isSimpleClearance ? 0 : Math.round(vatBase * (vatRate / 100));

  // 총 원가
  const totalCost = costKrw + shippingFee + customsDuty + vat;

  // 채널 수수료율
  const commissionRate = CHANNEL_COMMISSION_RATES[channel] / 100;

  // 판매가 계산
  // salePrice = totalCost × (1 + marginRate) / (1 - commissionRate)
  const salePrice = Math.ceil(totalCost * (1 + marginRate / 100) / (1 - commissionRate) / 10) * 10; // 10원 단위 올림

  // 채널 수수료
  const channelCommission = Math.round(salePrice * commissionRate);

  // 마진
  const margin = salePrice - channelCommission - totalCost;

  // 순이익률
  const netProfit = margin;
  const profitRate = salePrice > 0 ? Math.round((netProfit / salePrice) * 1000) / 10 : 0;

  return {
    costKrw,
    shippingFee,
    customsDuty,
    vat,
    totalCost,
    margin,
    channelCommission,
    salePrice,
    netProfit,
    profitRate,
    isSimpleClearance,
  };
}
