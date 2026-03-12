const KOREAEXIM_API_URL = 'https://www.koreaexim.go.kr/site/program/financial/exchangeJSON';

interface ExchangeRateResult {
  rate: number;
  currency: string;
  fetchedAt: string;
}

// Simple in-memory cache (24 hours)
let cachedRate: { rate: number; fetchedAt: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getCnyKrwRate(): Promise<ExchangeRateResult> {
  // Check cache
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL) {
    return {
      rate: cachedRate.rate,
      currency: 'CNY_KRW',
      fetchedAt: new Date(cachedRate.fetchedAt).toISOString(),
    };
  }

  try {
    const apiKey = process.env.KOREAEXIM_API_KEY;
    if (!apiKey) {
      // Fallback rate
      return { rate: 190, currency: 'CNY_KRW', fetchedAt: new Date().toISOString() };
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const url = `${KOREAEXIM_API_URL}?authkey=${apiKey}&searchdate=${today}&data=AP01`;
    const res = await fetch(url);
    const data = await res.json();

    const cny = (data as { cur_unit: string; deal_bas_r: string }[]).find(
      (item) => item.cur_unit === 'CNH' || item.cur_unit === 'CNY'
    );

    if (cny) {
      const rate = parseFloat(cny.deal_bas_r.replace(/,/g, ''));
      cachedRate = { rate, fetchedAt: Date.now() };
      return { rate, currency: 'CNY_KRW', fetchedAt: new Date().toISOString() };
    }

    // Fallback
    return { rate: 190, currency: 'CNY_KRW', fetchedAt: new Date().toISOString() };
  } catch {
    // Fallback rate on error
    return { rate: 190, currency: 'CNY_KRW', fetchedAt: new Date().toISOString() };
  }
}

export async function getUsdKrwRate(): Promise<ExchangeRateResult> {
  try {
    const apiKey = process.env.KOREAEXIM_API_KEY;
    if (!apiKey) {
      return { rate: 1350, currency: 'USD_KRW', fetchedAt: new Date().toISOString() };
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const url = `${KOREAEXIM_API_URL}?authkey=${apiKey}&searchdate=${today}&data=AP01`;
    const res = await fetch(url);
    const data = await res.json();

    const usd = (data as { cur_unit: string; deal_bas_r: string }[]).find(
      (item) => item.cur_unit === 'USD'
    );

    if (usd) {
      const rate = parseFloat(usd.deal_bas_r.replace(/,/g, ''));
      return { rate, currency: 'USD_KRW', fetchedAt: new Date().toISOString() };
    }

    return { rate: 1350, currency: 'USD_KRW', fetchedAt: new Date().toISOString() };
  } catch {
    return { rate: 1350, currency: 'USD_KRW', fetchedAt: new Date().toISOString() };
  }
}
