/**
 * 쿠팡 Open API 클라이언트
 * 서버 사이드에서만 사용
 */

import { formatSignedDate, buildAuthorizationHeader } from './coupang-hmac';

const PROXY_URL = process.env.COUPANG_PROXY_URL; // e.g. https://coupang-api-proxy.fly.dev
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const API_DOMAIN = 'https://api-gateway.coupang.com';
const REVENUE_BASE_PATH = '/v2/providers/openapi/apis/api/v1';
const SELLER_BASE_PATH = '/v2/providers/seller_api/apis/api/v1/marketplace';

export interface CoupangCredentials {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

export interface SettlementItem {
  settlementDate: string;
  orderId: string;
  vendorItemName: string;
  salePrice: number;
  commission: number;
  settlementAmount: number;
  shippingFee: number;
  returnFee: number;
}

export interface SettlementResponse {
  totalSettlement: number;
  totalSales: number;
  totalCommission: number;
  totalShipping: number;
  totalReturns: number;
  items: SettlementItem[];
  rawResponse: unknown;
}

export class CoupangApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'CoupangApiError';
  }
}

async function callCoupangApi(
  credentials: CoupangCredentials,
  method: string,
  path: string,
): Promise<unknown> {
  const datetime = formatSignedDate();
  const authorization = await buildAuthorizationHeader(
    credentials.accessKey,
    credentials.secretKey,
    method,
    path,
    datetime,
  );

  const useProxy = !!PROXY_URL;
  const url = useProxy ? `${PROXY_URL}/proxy${path}` : `${API_DOMAIN}${path}`;

  const headers: Record<string, string> = {
    'Authorization': authorization,
    'Content-Type': 'application/json;charset=UTF-8',
    'X-Requested-By': credentials.vendorId,
  };
  if (useProxy && PROXY_SECRET) {
    headers['X-Proxy-Secret'] = PROXY_SECRET;
  }

  const response = await fetch(url, { method, headers });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new CoupangApiError('API 인증에 실패했습니다. Access Key와 Secret Key를 확인해주세요.', 401, 'AUTH_FAILED');
    }
    if (response.status === 429) {
      throw new CoupangApiError('API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 429, 'RATE_LIMITED');
    }
    if (response.status >= 500) {
      throw new CoupangApiError('쿠팡 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', response.status, 'SERVER_ERROR');
    }
    throw new CoupangApiError(
      `API 요청 실패 (${response.status}): ${errorBody}`,
      response.status,
    );
  }

  return response.json();
}

/** 월별 정산 데이터 조회 (전체 페이지 순회) */
export async function fetchSettlementData(
  credentials: CoupangCredentials,
  yearMonth: string,
): Promise<SettlementResponse> {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const allItems: SettlementItem[] = [];
  let token = '';
  let lastRaw: unknown = null;
  const maxPerPage = 100;
  const maxPages = 100;

  for (let page = 0; page < maxPages; page++) {
    const path = `${REVENUE_BASE_PATH}/revenue-history?vendorId=${credentials.vendorId}&recognitionDateFrom=${startDate}&recognitionDateTo=${endDate}&token=${encodeURIComponent(token)}&maxPerPage=${maxPerPage}`;

    const data = await callCoupangApi(credentials, 'GET', path) as Record<string, unknown>;
    lastRaw = data;

    // 첫 페이지에서 응답 구조 로깅 (디버그용)
    if (page === 0) {
      const topKeys = Object.keys(data);
      const firstItem = Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null;
      console.log('[revenue-history] 응답 top-level keys:', topKeys);
      console.log('[revenue-history] data 배열 길이:', Array.isArray(data.data) ? data.data.length : 'not array');
      if (firstItem) {
        console.log('[revenue-history] 첫 번째 아이템 keys:', Object.keys(firstItem as Record<string, unknown>));
        console.log('[revenue-history] 첫 번째 아이템 샘플:', JSON.stringify(firstItem).slice(0, 500));
      }
    }

    const orders = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];

    for (const order of orders) {
      const orderItems = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : null;

      if (orderItems && orderItems.length > 0) {
        // 주문-아이템 중첩 구조
        const deliveryFee = order.deliveryFee as Record<string, number> | undefined;
        for (const item of orderItems) {
          allItems.push({
            settlementDate: String(order.settlementDate || ''),
            orderId: String(order.orderId || ''),
            vendorItemName: String(item.vendorItemName || ''),
            salePrice: Number(item.saleAmount ?? item.salePrice ?? 0),
            commission: Number(item.serviceFee ?? 0) + Number(item.serviceFeeVat ?? 0),
            settlementAmount: Number(item.settlementAmount ?? 0),
            shippingFee: Number(deliveryFee?.amount ?? 0),
            returnFee: 0,
          });
        }
      } else {
        // 플랫 구조 (폴백)
        allItems.push({
          settlementDate: String(order.settlementDate || ''),
          orderId: String(order.orderId || ''),
          vendorItemName: String(order.vendorItemName || ''),
          salePrice: Number(order.salePrice || 0),
          commission: Number(order.coupangFee || 0),
          settlementAmount: Number(order.settlementPrice || 0),
          shippingFee: Number(order.shippingPrice || 0),
          returnFee: Number(order.returnShippingPrice || 0),
        });
      }
    }

    // nextToken 확인 (필드명이 다를 수 있으므로 여러 가능성 체크)
    const next = data.nextToken ?? data.token ?? '';
    token = String(next);
    console.log(`[revenue-history] page ${page}: ${orders.length}건, nextToken=${token ? 'yes' : 'none'}`);
    if (!token) break;
  }

  const totalSales = allItems.reduce((sum, i) => sum + i.salePrice, 0);
  const totalCommission = allItems.reduce((sum, i) => sum + i.commission, 0);
  const totalShipping = allItems.reduce((sum, i) => sum + i.shippingFee, 0);
  const totalReturns = allItems.reduce((sum, i) => sum + i.returnFee, 0);
  const totalSettlement = allItems.reduce((sum, i) => sum + i.settlementAmount, 0);

  console.log(`[revenue-history] 총 ${allItems.length}건, 매출=${totalSales}, 정산=${totalSettlement}`);

  return {
    totalSettlement,
    totalSales,
    totalCommission,
    totalShipping,
    totalReturns,
    items: allItems,
    rawResponse: lastRaw,
  };
}

/** 상품 목록 조회 (오늘 등록 상품 수 카운트용, 전체 페이지 순회) */
export async function fetchProductListings(
  credentials: CoupangCredentials,
  dateFrom: string,
  dateTo: string,
): Promise<{ count: number; rawResponse: unknown }> {
  let totalCount = 0;
  let nextToken = '';
  let lastResponse: unknown = null;
  const maxPerPage = 100;
  const maxPages = 200;

  for (let page = 0; page < maxPages; page++) {
    const tokenParam = nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '';
    const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&createdAtFrom=${dateFrom}&createdAtTo=${dateTo}&status=APPROVED&maxPerPage=${maxPerPage}${tokenParam}`;

    const data = await callCoupangApi(credentials, 'GET', path) as {
      code?: string;
      nextToken?: string;
      data?: Array<Record<string, unknown>>;
    };

    lastResponse = data;
    totalCount += data.data?.length ?? 0;
    nextToken = data.nextToken || '';
    if (!nextToken) break;
  }

  return { count: totalCount, rawResponse: lastResponse };
}

/** 전체 등록 상품 수 조회 (날짜 무관, 총 누적 건수, nextToken 페이지네이션) */
export async function fetchTotalProductCount(
  credentials: CoupangCredentials,
): Promise<{ count: number; rawResponse: unknown }> {
  let totalCount = 0;
  let nextToken = '';
  let lastResponse: unknown = null;
  const maxPerPage = 100;
  const maxPages = 200;

  for (let page = 0; page < maxPages; page++) {
    const tokenParam = nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '';
    const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&status=APPROVED&maxPerPage=${maxPerPage}${tokenParam}`;

    const data = await callCoupangApi(credentials, 'GET', path) as Record<string, unknown>;
    lastResponse = data;

    // 첫 페이지에서 응답 구조 로깅
    if (page === 0) {
      console.log('[seller-products] 응답 top-level keys:', Object.keys(data));
      console.log('[seller-products] data 배열 길이:', Array.isArray(data.data) ? (data.data as unknown[]).length : 'not array');
      console.log('[seller-products] nextToken:', data.nextToken ?? '(없음)');
    }

    const items = Array.isArray(data.data) ? data.data as unknown[] : [];
    totalCount += items.length;
    nextToken = String(data.nextToken ?? '');
    console.log(`[seller-products] page ${page}: ${items.length}건, 누적=${totalCount}, nextToken=${nextToken ? 'yes' : 'none'}`);
    if (!nextToken) break;
  }

  console.log(`[seller-products] 총 상품 수: ${totalCount}`);
  return { count: totalCount, rawResponse: lastResponse };
}

/** API 자격증명 유효성 검증 */
export async function validateApiCredentials(
  credentials: CoupangCredentials,
): Promise<{ valid: boolean; message: string }> {
  try {
    // 가벼운 상품 목록 조회로 인증 검증 (maxPerPage=1)
    const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&maxPerPage=1`;
    await callCoupangApi(credentials, 'GET', path);
    return { valid: true, message: 'API 연동이 확인되었습니다.' };
  } catch (error) {
    if (error instanceof CoupangApiError) {
      if (error.statusCode === 401) {
        return { valid: false, message: 'Access Key 또는 Secret Key가 올바르지 않습니다.' };
      }
      if (error.statusCode === 404) {
        return { valid: false, message: 'Vendor ID가 올바르지 않거나 API 권한이 없습니다.' };
      }
      return { valid: false, message: error.message };
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { valid: false, message: `API 연결에 실패했습니다: ${msg}` };
  }
}
