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
    // 프록시 모드: 프록시가 HMAC 서명을 직접 생성하므로
    // Access Key / Secret Key를 헤더로 전달
    headers['X-Coupang-Access-Key'] = credentials.accessKey;
    headers['X-Coupang-Secret-Key'] = credentials.secretKey;
    if (PROXY_SECRET) {
      headers['X-Proxy-Secret'] = PROXY_SECRET;
    }
  } else {
    // 직접 모드: 클라이언트에서 HMAC 서명 생성
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
      throw new CoupangApiError(`인증 실패 (401): ${errorBody || 'No response body'}`, 401, 'AUTH_FAILED');
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
    nextToken?: string;
  },
): Promise<{ count: number; items: CoupangProductItem[]; rawResponse: unknown; nextToken?: string }> {
  const allItems: CoupangProductItem[] = [];
  let nextToken = options?.nextToken || '';
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
        // items 배열이 없는 상품은 건너뜀 (vendorItemId 없이는 쿠폰 적용 불가)
        console.warn(`[fetchProductListings] 상품 ${sellerProductId}에 items 배열 없음 — 건너뜀`);
      }
    }

    nextToken = data.nextToken || '';
    if (!nextToken) break;
  }

  return { count: allItems.length, items: allItems, rawResponse: lastResponse, nextToken: nextToken || undefined };
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
// 즉시할인 쿠폰: fms 프로바이더 (비동기 — requestedId 반환)
// 다운로드 쿠폰: marketplace_openapi 프로바이더 (비동기 — requestTransactionId 반환)

const FMS_BASE = '/v2/providers/fms/apis/api';
const MKT_OPENAPI_BASE = '/v2/providers/marketplace_openapi/apis/api/v1';

/** 계약서 목록 조회 */
export async function fetchContracts(
  credentials: CoupangCredentials,
): Promise<CoupangContract[]> {
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/contracts`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangContract[] };
  return data.data || [];
}

/** 즉시할인 쿠폰 목록 조회 */
export async function fetchInstantCoupons(
  credentials: CoupangCredentials,
): Promise<CoupangCoupon[]> {
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupons`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon[] };
  return data.data || [];
}

/** 즉시할인 쿠폰 생성 — 비동기 (requestedId 반환) */
export async function createInstantCoupon(
  credentials: CoupangCredentials,
  params: CreateInstantCouponParams,
): Promise<CoupangCoupon> {
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupon`;
  const data = await callCoupangApi(credentials, 'POST', path, params) as { data?: CoupangCoupon };
  if (!data.data) throw new CoupangApiError('즉시할인 쿠폰 생성 응답에 data가 없습니다.', 500);
  return data.data;
}

/** 즉시할인 쿠폰 아이템 추가 (상품에 쿠폰 연결) — 비동기 (requestedId 반환) */
export async function applyInstantCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<unknown> {
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupons/${couponId}/coupon-items`;
  // 쿠팡 FMS API는 vendorItemIds를 숫자 배열로 요구
  const numericIds = vendorItemIds.map(Number).filter((n) => !isNaN(n));
  return callCoupangApi(credentials, 'POST', path, { vendorItemIds: numericIds });
}

/** 즉시할인 쿠폰 요청 상태 확인 */
export async function checkInstantCouponStatus(
  credentials: CoupangCredentials,
  requestedId: string,
): Promise<unknown> {
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/requested/${requestedId}`;
  return callCoupangApi(credentials, 'GET', path);
}

/** 다운로드 쿠폰 목록 조회 */
export async function fetchDownloadCoupons(
  credentials: CoupangCredentials,
): Promise<CoupangCoupon[]> {
  const path = `${MKT_OPENAPI_BASE}/coupons?vendorId=${credentials.vendorId}`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon[] };
  return data.data || [];
}

/** 다운로드 쿠폰 단건 조회 */
export async function fetchDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<CoupangCoupon> {
  const path = `${MKT_OPENAPI_BASE}/coupons/${couponId}`;
  const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon };
  if (!data.data) throw new CoupangApiError('다운로드 쿠폰 조회 응답에 data가 없습니다.', 500);
  return data.data;
}

/** 다운로드 쿠폰 생성 — 비동기 (requestTransactionId 반환) */
export async function createDownloadCoupon(
  credentials: CoupangCredentials,
  params: CreateDownloadCouponParams,
): Promise<CoupangCoupon> {
  const path = `${MKT_OPENAPI_BASE}/coupons`;
  const data = await callCoupangApi(credentials, 'POST', path, params) as { data?: CoupangCoupon };
  if (!data.data) throw new CoupangApiError('다운로드 쿠폰 생성 응답에 data가 없습니다.', 500);
  return data.data;
}

/** 다운로드 쿠폰 요청 상태 확인 */
export async function checkDownloadCouponStatus(
  credentials: CoupangCredentials,
  requestTransactionId: string,
): Promise<unknown> {
  const path = `${MKT_OPENAPI_BASE}/coupons/transactionStatus?requestTransactionId=${requestTransactionId}`;
  return callCoupangApi(credentials, 'GET', path);
}

/** 다운로드 쿠폰 적용 — 주의: 쿠팡 API는 다운로드 쿠폰 아이템 사후 추가 미지원.
 *  생성 시 vendorItemIds를 포함해야 합니다. 이 함수는 호환성을 위해 유지됩니다. */
export async function applyDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<unknown> {
  const path = `${MKT_OPENAPI_BASE}/coupons/${couponId}/items`;
  // 쿠팡 API는 vendorItemIds를 숫자 배열로 요구
  const numericIds = vendorItemIds.map(Number).filter((n) => !isNaN(n));
  return callCoupangApi(credentials, 'POST', path, { vendorItemIds: numericIds });
}

/** 단일 모드(프록시 또는 직접) API 호출 테스트 */
async function testApiCall(
  credentials: CoupangCredentials,
  mode: 'proxy' | 'direct',
): Promise<{ ok: boolean; status: number; body: string }> {
  const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&maxPerPage=1`;
  const isProxy = mode === 'proxy' && !!PROXY_URL;
  const url = isProxy ? `${PROXY_URL}/proxy${path}` : `${API_DOMAIN}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
  };

  if (isProxy) {
    headers['X-Coupang-Access-Key'] = credentials.accessKey;
    headers['X-Coupang-Secret-Key'] = credentials.secretKey;
    if (PROXY_SECRET) headers['X-Proxy-Secret'] = PROXY_SECRET;
  } else {
    const datetime = formatSignedDate();
    const authorization = await buildAuthorizationHeader(
      credentials.accessKey, credentials.secretKey, 'GET', path, datetime,
    );
    headers['Authorization'] = authorization;
    headers['X-Requested-By'] = credentials.vendorId;
  }

  const response = await fetch(url, { method: 'GET', headers });
  const body = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, body: body.slice(0, 500) };
}

/** API 자격증명 유효성 검증 — 프록시/직접 양쪽 진단 */
export async function validateApiCredentials(
  credentials: CoupangCredentials,
): Promise<{ valid: boolean; message: string; detail?: string; statusCode?: number; diagnosis?: unknown }> {
  const useProxy = !!PROXY_URL;
  const results: Record<string, unknown> = {
    mode: useProxy ? 'proxy' : 'direct',
    proxyUrl: PROXY_URL || '(없음)',
    proxySecretSet: !!PROXY_SECRET,
  };

  // 1) 현재 모드(프록시 or 직접)로 테스트
  try {
    const primary = await testApiCall(credentials, useProxy ? 'proxy' : 'direct');
    results.primaryTest = { mode: useProxy ? 'proxy' : 'direct', ...primary };

    if (primary.ok) {
      return { valid: true, message: 'API 연동이 확인되었습니다.', diagnosis: results };
    }

    // 실패 시, 반대 모드로도 테스트하여 원인 구분
    if (useProxy) {
      try {
        const direct = await testApiCall(credentials, 'direct');
        results.directTest = direct;
      } catch (e) {
        results.directTest = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // 결과 분석
    const proxyResult = results.primaryTest as { ok: boolean; status: number; body: string };
    const directResult = results.directTest as { ok?: boolean; status?: number; body?: string } | undefined;

    // 프록시 실패 + 직접 성공 = 프록시/IP 문제
    if (useProxy && directResult?.ok) {
      return {
        valid: false,
        message: '프록시 경유 시 실패하지만, 직접 연결은 성공합니다. 프록시 IP 화이트리스트 또는 프록시 설정 문제입니다.',
        detail: `프록시(${proxyResult.status}): ${proxyResult.body}\n직접 연결: 성공`,
        statusCode: proxyResult.status,
        diagnosis: results,
      };
    }

    // 프록시 실패 + 직접 실패 = 자격증명 자체 문제
    if (useProxy && directResult && !directResult.ok) {
      return {
        valid: false,
        message: '프록시와 직접 연결 모두 실패합니다. Access Key/Secret Key가 올바른지 확인하세요.',
        detail: `프록시(${proxyResult.status}): ${proxyResult.body}\n직접(${directResult.status}): ${directResult.body}`,
        statusCode: proxyResult.status,
        diagnosis: results,
      };
    }

    // 프록시 없이 직접 연결 실패
    const statusText = proxyResult.status === 401 ? 'Access Key 또는 Secret Key가 올바르지 않습니다.'
      : proxyResult.status === 403 ? 'API 접근이 거부되었습니다. IP 화이트리스트를 확인하세요.'
      : proxyResult.status === 404 ? 'Vendor ID가 올바르지 않거나 API 권한이 없습니다.'
      : `API 요청 실패 (HTTP ${proxyResult.status})`;

    return {
      valid: false,
      message: statusText,
      detail: `[${useProxy ? '프록시' : '직접'}] ${proxyResult.body}`,
      statusCode: proxyResult.status,
      diagnosis: results,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.error = msg;
    return {
      valid: false,
      message: `API 연결에 실패했습니다: ${msg}`,
      diagnosis: results,
    };
  }
}
