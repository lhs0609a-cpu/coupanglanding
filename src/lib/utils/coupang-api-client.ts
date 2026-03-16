/**
 * 쿠팡 Open API 클라이언트
 * 서버 사이드에서만 사용
 */

import { formatSignedDate, buildAuthorizationHeader } from './coupang-hmac';

const PROXY_URL = process.env.COUPANG_PROXY_URL; // e.g. https://coupang-api-proxy.fly.dev
const PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';
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

// ── 쿠폰/계약 관련 인터페이스 ─────────────────────────
export interface CoupangContract {
  contractId: number;
  contractName: string;
  startDate: string;
  endDate: string;
  contractStatus: string;
}

export interface CoupangCoupon {
  couponId: number;
  couponName: string;
  couponStatus: string;
  startDate?: string;
  endDate?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscountPrice?: number;
  policies?: unknown[];
}

export interface CreateInstantCouponParams {
  title: string;
  startDate: string;
  endDate: string;
  discountType: 'RATE' | 'FIXED';
  discountValue: number;
  maxDiscountPrice?: number;
  contractId: number;
}

export interface CreateDownloadCouponParams {
  title: string;
  startDate: string;
  endDate: string;
  policies: unknown[];
  contractId: number;
}

async function callCoupangApi(
  credentials: CoupangCredentials,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const useProxy = !!PROXY_URL;
  const url = useProxy ? `${PROXY_URL}/proxy${path}` : `${API_DOMAIN}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
  };

  if (useProxy) {
    // 프록시 모드: 프록시가 자체적으로 HMAC 서명을 생성
    headers['X-Coupang-Access-Key'] = credentials.accessKey;
    headers['X-Coupang-Secret-Key'] = credentials.secretKey;
    headers['X-Coupang-Vendor-Id'] = credentials.vendorId;
    if (PROXY_SECRET) {
      headers['X-Proxy-Secret'] = PROXY_SECRET;
    }
  } else {
    // 직접 호출 모드: 클라이언트에서 HMAC 서명 생성
    const datetime = formatSignedDate();
    const authorization = await buildAuthorizationHeader(
      credentials.accessKey,
      credentials.secretKey,
      method,
      path,
      datetime,
    );
    headers['Authorization'] = authorization;
    headers['X-Requested-By'] = credentials.vendorId;
  }

  const fetchInit: RequestInit = { method, headers };
  if (body !== undefined && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchInit.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchInit);

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
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // API는 "전일까지만 조회 가능" → endDate를 어제와 월말 중 빠른 날짜로
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const endDate = monthEnd < yesterdayStr ? monthEnd : yesterdayStr;

  // 시작일이 endDate보다 미래면 아직 데이터 없음
  if (startDate > endDate) {
    return { totalSettlement: 0, totalSales: 0, totalCommission: 0, totalShipping: 0, totalReturns: 0, items: [], rawResponse: null };
  }

  const allItems: SettlementItem[] = [];
  let token = '';
  let lastRaw: unknown = null;
  const maxPerPage = 50; // API 최대값 50
  const maxPages = 200;

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

/** 상품-아이템 정보 */
export interface CoupangProductItem {
  sellerProductId: string;
  sellerProductName: string;
  vendorItemId: string;
  vendorItemName: string;
  createdAt: string | null;
}

/** 상품 목록 조회 (전체 페이지 순회, vendorItemId 포함) */
export async function fetchProductListings(
  credentials: CoupangCredentials,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    maxPages?: number;
  },
): Promise<{ count: number; items: CoupangProductItem[]; rawResponse: unknown }> {
  const allItems: CoupangProductItem[] = [];
  let nextToken = '';
  let lastResponse: unknown = null;
  const maxPerPage = 100;
  const maxPages = options?.maxPages ?? 200;
  const status = options?.status ?? 'APPROVED';

  for (let page = 0; page < maxPages; page++) {
    const tokenParam = nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '';
    const dateParams = options?.dateFrom && options?.dateTo
      ? `&createdAtFrom=${options.dateFrom}&createdAtTo=${options.dateTo}`
      : '';
    const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}${dateParams}&status=${status}&maxPerPage=${maxPerPage}${tokenParam}`;

    const data = await callCoupangApi(credentials, 'GET', path) as {
      code?: string;
      nextToken?: string;
      data?: Array<Record<string, unknown>>;
    };

    lastResponse = data;

    for (const product of (data.data || [])) {
      const sellerProductId = String(product.sellerProductId || '');
      const sellerProductName = String(product.sellerProductName || product.productName || '');
      const createdAt = product.createdAt ? String(product.createdAt) : null;

      // Each product can have multiple vendor items (options/variants)
      const items = Array.isArray(product.items) ? product.items as Array<Record<string, unknown>> : [];

      if (items.length > 0) {
        for (const item of items) {
          allItems.push({
            sellerProductId,
            sellerProductName,
            vendorItemId: String(item.vendorItemId || ''),
            vendorItemName: String(item.itemName || item.vendorItemName || sellerProductName),
            createdAt,
          });
        }
      } else {
        // Fallback: product without items array (use sellerProductId as vendorItemId)
        allItems.push({
          sellerProductId,
          sellerProductName,
          vendorItemId: sellerProductId,
          vendorItemName: sellerProductName,
          createdAt,
        });
      }
    }

    nextToken = data.nextToken || '';
    if (!nextToken) break;
  }

  return { count: allItems.length, items: allItems, rawResponse: lastResponse };
}

/** 전체 등록 상품 수 조회 (inflow-status API 사용 - 단일 호출) */
export async function fetchTotalProductCount(
  credentials: CoupangCredentials,
): Promise<{ count: number; rawResponse: unknown }> {
  const path = `${SELLER_BASE_PATH}/seller-products/inflow-status`;

  const data = await callCoupangApi(credentials, 'GET', path) as {
    code?: string;
    data?: {
      vendorId?: string;
      registeredCount?: number;
      permittedCount?: number | null;
      restricted?: boolean;
    };
  };

  const count = data.data?.registeredCount ?? 0;
  console.log(`[inflow-status] 등록 상품 수: ${count}, 최대: ${data.data?.permittedCount ?? '무제한'}`);

  return { count, rawResponse: data };
}

// ── 쿠폰/계약 API 함수들 ───────────────────────────────

const COUPON_BASE_PATH = '/v2/providers/seller_api/apis/api/v1/marketplace';

/** 계약서 목록 조회 */
export async function fetchContracts(
  credentials: CoupangCredentials,
): Promise<CoupangContract[]> {
  const path = `${COUPON_BASE_PATH}/seller-contracts?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangContract[] };
  return data.data || [];
}

/** 즉시할인 쿠폰 목록 조회 */
export async function fetchInstantCoupons(
  credentials: CoupangCredentials,
): Promise<CoupangCoupon[]> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/instant-coupons?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon[] };
  return data.data || [];
}

/** 즉시할인 쿠폰 생성 */
export async function createInstantCoupon(
  credentials: CoupangCredentials,
  params: CreateInstantCouponParams,
): Promise<CoupangCoupon> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/instant-coupons?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'POST', path, params) as { data?: CoupangCoupon };
  if (!data.data) throw new CoupangApiError('즉시할인 쿠폰 생성 응답에 data가 없습니다.', 500);
  return data.data;
}

/** 즉시할인 쿠폰 적용 (상품에 쿠폰 연결) */
export async function applyInstantCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: string[],
): Promise<unknown> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/instant-coupons/${couponId}/items?vendorId=${credentials.vendorId}`;
  return callCoupangApi(credentials, 'POST', path, { vendorItemIds });
}

/** 다운로드 쿠폰 목록 조회 */
export async function fetchDownloadCoupons(
  credentials: CoupangCredentials,
): Promise<CoupangCoupon[]> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/download-coupons?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon[] };
  return data.data || [];
}

/** 다운로드 쿠폰 단건 조회 (정책 포함) */
export async function fetchDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<CoupangCoupon> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/download-coupons/${couponId}?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon };
  if (!data.data) throw new CoupangApiError('다운로드 쿠폰 조회 응답에 data가 없습니다.', 500);
  return data.data;
}

/** 다운로드 쿠폰 생성 */
export async function createDownloadCoupon(
  credentials: CoupangCredentials,
  params: CreateDownloadCouponParams,
): Promise<CoupangCoupon> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/download-coupons?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'POST', path, params) as { data?: CoupangCoupon };
  if (!data.data) throw new CoupangApiError('다운로드 쿠폰 생성 응답에 data가 없습니다.', 500);
  return data.data;
}

/** 다운로드 쿠폰 적용 (상품에 쿠폰 연결) */
export async function applyDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: string[],
): Promise<unknown> {
  const path = `${COUPON_BASE_PATH}/seller-coupons/download-coupons/${couponId}/items?vendorId=${credentials.vendorId}`;
  return callCoupangApi(credentials, 'POST', path, { vendorItemIds });
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
