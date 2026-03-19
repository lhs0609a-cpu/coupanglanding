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
  contractId?: number;
  startDate?: string;
  endDate?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscountPrice?: number;
  policies?: unknown[];
  requestTransactionId?: string;
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
  contractId: number | string;
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
    headers['X-Coupang-Vendor-Id'] = credentials.vendorId; // X-Requested-By용
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

/** 계약서 목록 조회
 *  ⚠️ FMS v2 contract API가 410 RETIRED됨
 *  여러 경로를 순서대로 시도하고, 모두 실패 시 빈 배열 반환 */
export async function fetchContracts(
  credentials: CoupangCredentials,
): Promise<CoupangContract[]> {
  // 시도할 경로 목록 (가능성 높은 순서)
  const pathsToTry = [
    `${FMS_BASE}/v2/vendors/${credentials.vendorId}/contracts`,  // 복수형
    `${FMS_BASE}/v2/vendors/${credentials.vendorId}/contract`,   // 단수형
    `${FMS_BASE}/v1/vendors/${credentials.vendorId}/contracts`,  // v1 복수형
    `${FMS_BASE}/v1/vendors/${credentials.vendorId}/contract`,   // v1 단수형
    `${FMS_BASE}/v3/vendors/${credentials.vendorId}/contracts`,  // v3 시도
  ];

  for (const path of pathsToTry) {
    try {
      const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangContract[] };
      if (data.data && data.data.length > 0) {
        console.log(`[fetchContracts] 성공 경로: ${path}`);
        return data.data;
      }
    } catch (err) {
      if (err instanceof CoupangApiError && (err.statusCode === 404 || err.statusCode === 410)) {
        continue; // 다음 경로 시도
      }
      // 인증 오류 등 다른 에러는 즉시 중단
      if (err instanceof CoupangApiError && err.statusCode === 401) {
        throw err;
      }
      continue;
    }
  }

  // 계약서 API 모두 실패 → 기존 쿠폰 목록에서 contractId 추출 시도
  console.warn('[fetchContracts] 계약서 API 모두 실패 — 쿠폰 목록에서 contractId 추출 시도');

  // 시도 1: FMS 즉시할인 쿠폰 목록
  // 시도 2: marketplace_openapi 다운로드 쿠폰 목록
  const couponApiPaths = [
    `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupons`,
    `${MKT_OPENAPI_BASE}/coupons?vendorId=${credentials.vendorId}`,
  ];

  for (const couponsPath of couponApiPaths) {
    try {
      const rawCouponsData = await callCoupangApi(credentials, 'GET', couponsPath);
      const rawData = rawCouponsData as Record<string, unknown>;
      console.log(`[fetchContracts] 쿠폰 API (${couponsPath}) 응답 키:`, Object.keys(rawData));

      // 응답에서 쿠폰 배열 추출 (다양한 응답 구조 대응)
      let couponsList: Record<string, unknown>[] = [];
      if (Array.isArray(rawData.data)) {
        couponsList = rawData.data as Record<string, unknown>[];
      } else if (Array.isArray(rawData.content)) {
        couponsList = rawData.content as Record<string, unknown>[];
      } else if (Array.isArray(rawData.results)) {
        couponsList = rawData.results as Record<string, unknown>[];
      } else if (typeof rawData.data === 'object' && rawData.data !== null) {
        // data가 배열이 아닌 객체인 경우 (페이징된 응답)
        const inner = rawData.data as Record<string, unknown>;
        if (Array.isArray(inner.content)) couponsList = inner.content as Record<string, unknown>[];
        else if (Array.isArray(inner.coupons)) couponsList = inner.coupons as Record<string, unknown>[];
      }

      if (couponsList.length > 0) {
        console.log('[fetchContracts] 첫 번째 쿠폰 필드:', Object.keys(couponsList[0]));
        console.log('[fetchContracts] 첫 번째 쿠폰 데이터:', JSON.stringify(couponsList[0]).slice(0, 500));
      }

      // 쿠폰들에서 고유 contractId 추출 (다양한 필드명 시도)
      const contractMap = new Map<number, CoupangContract>();
      for (const coupon of couponsList) {
        const cid = Number(
          coupon.contractId ?? coupon.contract_id ?? coupon.manageContractId ??
          coupon.ContractId ?? coupon.contractid ?? 0,
        );
        if (cid > 0 && !contractMap.has(cid)) {
          contractMap.set(cid, {
            contractId: cid,
            contractName: `계약서 #${cid} (자동 감지)`,
            startDate: String(coupon.startDate || coupon.start_date || ''),
            endDate: String(coupon.endDate || coupon.end_date || ''),
            contractStatus: 'ACTIVE',
          });
        }
      }

      if (contractMap.size > 0) {
        const contracts = Array.from(contractMap.values());
        console.log(`[fetchContracts] 쿠폰 목록에서 ${contracts.length}개 계약서 ID 자동 추출 성공`);
        return contracts;
      }
    } catch (err) {
      console.warn(`[fetchContracts] 쿠폰 목록 조회 실패 (${couponsPath}):`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  console.warn('[fetchContracts] 모든 방법 실패 — 빈 배열 반환 (DB fallback은 route에서 처리)');
  return [];
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
  // 쿠팡 FMS coupon-items API는 v1 사용 (coupon list/create는 v2)
  // 문서: /api/v1/vendors/{vendorId}/coupons/{couponId}/items
  const path = `${FMS_BASE}/v1/vendors/${credentials.vendorId}/coupons/${couponId}/items`;
  const numericIds = vendorItemIds.map(Number).filter((n) => !isNaN(n));
  return callCoupangApi(credentials, 'POST', path, { vendorItemIds: numericIds });
}

/** 즉시할인 쿠폰 요청 상태 확인 */
export async function checkInstantCouponStatus(
  credentials: CoupangCredentials,
  requestedId: string,
): Promise<unknown> {
  // 문서: /api/v2/vendors/{vendorId}/requested/{requestedId}
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/requested/${requestedId}`;
  return callCoupangApi(credentials, 'GET', path);
}

/** 다운로드 쿠폰 목록 조회
 *  ⚠️ marketplace_openapi v1 coupons API가 2025년 폐기(410 RETIRED)됨.
 *  에러 시 빈 배열 반환하여 페이지 로드를 방해하지 않음. */
export async function fetchDownloadCoupons(
  credentials: CoupangCredentials,
): Promise<CoupangCoupon[]> {
  try {
    const path = `${MKT_OPENAPI_BASE}/coupons?vendorId=${credentials.vendorId}`;
    const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon[] };
    return data.data || [];
  } catch (err) {
    // 410 RETIRED — API가 폐기됨, 빈 배열 반환
    if (err instanceof CoupangApiError && (err.statusCode === 410 || err.statusCode === 404)) {
      console.warn('[fetchDownloadCoupons] marketplace_openapi 쿠폰 API 폐기됨 (410/404), 빈 배열 반환');
      return [];
    }
    throw err;
  }
}

/** 쿠폰 단건 조회 (FMS + marketplace_openapi 폴백)
 *  FMS 쿠폰 목록에서 couponId로 검색 → 실패 시 marketplace_openapi 시도 */
export async function fetchDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<CoupangCoupon | null> {
  // 1차: FMS 쿠폰 목록에서 해당 couponId 찾기 (FMS API는 작동 중)
  try {
    const fmsPath = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupons`;
    const fmsData = await callCoupangApi(credentials, 'GET', fmsPath) as Record<string, unknown>;

    let couponsList: Record<string, unknown>[] = [];
    if (Array.isArray(fmsData.data)) {
      couponsList = fmsData.data as Record<string, unknown>[];
    } else if (typeof fmsData.data === 'object' && fmsData.data !== null) {
      const inner = fmsData.data as Record<string, unknown>;
      if (Array.isArray(inner.content)) couponsList = inner.content as Record<string, unknown>[];
    }

    const found = couponsList.find((c) => Number(c.couponId) === couponId);
    if (found) {
      console.log(`[fetchDownloadCoupon] FMS 쿠폰 목록에서 ${couponId} 발견`);
      console.log('[fetchDownloadCoupon] 쿠폰 데이터:', JSON.stringify(found).slice(0, 500));
      return {
        couponId: Number(found.couponId),
        couponName: String(found.couponName || found.title || ''),
        couponStatus: String(found.couponStatus || found.status || ''),
        contractId: Number(found.contractId || 0),
        startDate: String(found.startDate || ''),
        endDate: String(found.endDate || ''),
        policies: (found.couponPolicies || found.policies || []) as unknown[],
      };
    }
    console.log(`[fetchDownloadCoupon] FMS 쿠폰 목록에 ${couponId} 없음 (총 ${couponsList.length}개)`);
  } catch (err) {
    console.warn('[fetchDownloadCoupon] FMS 쿠폰 목록 조회 실패:', err instanceof Error ? err.message : err);
  }

  // 2차: marketplace_openapi 단건 조회 (폐기됐을 수 있음)
  try {
    const path = `${MKT_OPENAPI_BASE}/coupons/${couponId}`;
    const data = await callCoupangApi(credentials, 'GET', path) as { data?: CoupangCoupon };
    return data.data || null;
  } catch (err) {
    if (err instanceof CoupangApiError && (err.statusCode === 410 || err.statusCode === 404)) {
      console.warn(`[fetchDownloadCoupon] marketplace_openapi 쿠폰 API 폐기됨 (${err.statusCode})`);
      return null;
    }
    throw err;
  }
}

/** 쿠팡 API 날짜 형식 변환 (ISO → 'YYYY-MM-DD HH:mm:ss') */
function toCoupangDateFormat(isoDate: string): string {
  // "2026-03-20T10:30:00.000" or "2026-03-20T10:30:00" → "2026-03-20 10:30:00"
  return isoDate.replace('T', ' ').replace(/\.\d+$/, '').replace('Z', '');
}

/** 다운로드 쿠폰 생성 (아이템 없이 — 아이템은 별도 API로 등록)
 *
 *  쿠팡 공식 API:
 *  - POST /v2/providers/marketplace_openapi/apis/api/v1/coupons
 *  - body: { title, contractId(string), couponType:"DOWNLOAD", startDate, endDate, userId, policies }
 *  - 아이템(vendorItemIds)은 쿠폰 생성 후 별도 item creation API로 등록
 *  - FMS 프로바이더는 즉시할인 전용이므로 다운로드 쿠폰에 사용 불가 */
export async function createDownloadCoupon(
  credentials: CoupangCredentials,
  params: CreateDownloadCouponParams,
): Promise<CoupangCoupon> {
  // 쿠팡 공식 엔드포인트: marketplace_openapi
  const mktPath = `${MKT_OPENAPI_BASE}/coupons`;
  const body = {
    title: params.title,
    contractId: String(params.contractId), // 반드시 string 타입
    couponType: 'DOWNLOAD',
    startDate: toCoupangDateFormat(params.startDate),
    endDate: toCoupangDateFormat(params.endDate),
    userId: credentials.vendorId, // 쿠팡 API 필수 필드
    policies: params.policies,
  };

  console.log('[createDownloadCoupon] 요청 경로:', mktPath);
  console.log('[createDownloadCoupon] 요청 body:', JSON.stringify(body).slice(0, 500));

  // 1차: marketplace_openapi (공식 다운로드 쿠폰 엔드포인트)
  try {
    const data = await callCoupangApi(credentials, 'POST', mktPath, body) as {
      data?: CoupangCoupon;
      code?: string;
      message?: string;
      requestTransactionId?: string;
    };

    console.log('[createDownloadCoupon] marketplace_openapi 응답:', JSON.stringify(data).slice(0, 500));

    if (data.data) return data.data;

    if (data.requestTransactionId) {
      return {
        couponId: 0,
        couponName: params.title,
        couponStatus: 'PENDING',
        requestTransactionId: data.requestTransactionId,
      } as CoupangCoupon & { requestTransactionId: string };
    }

    // 응답은 성공(2xx)이지만 data도 requestTransactionId도 없는 경우
    console.warn('[createDownloadCoupon] marketplace_openapi 응답에 data/requestTransactionId 없음:', JSON.stringify(data).slice(0, 300));
  } catch (mktErr) {
    // 410 RETIRED면 FMS 폴백 시도
    if (mktErr instanceof CoupangApiError && (mktErr.statusCode === 410 || mktErr.statusCode === 404)) {
      console.warn(`[createDownloadCoupon] marketplace_openapi ${mktErr.statusCode} — FMS 폴백 시도`);
    } else {
      throw mktErr; // 다른 에러(401, 400 등)는 즉시 throw
    }
  }

  // 2차 폴백: FMS 프로바이더 (일부 셀러에서 다운로드 쿠폰도 FMS로 처리 가능)
  const fmsPath = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupon`;
  const fmsBody = {
    ...body,
    couponType: 'DOWNLOAD', // FMS에서는 명시 필요
  };

  console.log('[createDownloadCoupon] FMS 폴백 시도:', fmsPath);
  const fmsData = await callCoupangApi(credentials, 'POST', fmsPath, fmsBody) as {
    data?: CoupangCoupon;
    code?: string;
    message?: string;
    requestTransactionId?: string;
  };

  console.log('[createDownloadCoupon] FMS 응답:', JSON.stringify(fmsData).slice(0, 500));

  if (fmsData.data) return fmsData.data;

  if (fmsData.requestTransactionId) {
    return {
      couponId: 0,
      couponName: params.title,
      couponStatus: 'PENDING',
      requestTransactionId: fmsData.requestTransactionId,
    } as CoupangCoupon & { requestTransactionId: string };
  }

  throw new CoupangApiError(
    `다운로드 쿠폰 생성 실패 (marketplace_openapi + FMS 모두 실패): ${fmsData.message || JSON.stringify(fmsData).slice(0, 200)}`,
    500,
  );
}

/** 다운로드 쿠폰에 아이템 등록 (쿠폰 생성 후 별도 호출)
 *
 *  쿠팡 공식 API:
 *  - POST /v2/providers/marketplace_openapi/apis/api/v1/coupons/{couponId}/items
 *  - body: { vendorItemIds: [number, ...] }
 *  - 최대 10,000개 아이템 등록 가능
 *  - 등록 후 변경 불가 (변경하려면 기존 쿠폰 중지 후 새 쿠폰 생성) */
export async function addDownloadCouponItems(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<{ requestTransactionId?: string }> {
  const numericIds = vendorItemIds.map(Number).filter((n) => !isNaN(n));
  const body = { vendorItemIds: numericIds };

  // 1차: marketplace_openapi
  const mktPath = `${MKT_OPENAPI_BASE}/coupons/${couponId}/items`;
  console.log(`[addDownloadCouponItems] 쿠폰 ${couponId}에 ${numericIds.length}개 아이템 등록 (marketplace_openapi)`);

  try {
    const data = await callCoupangApi(credentials, 'POST', mktPath, body) as {
      requestTransactionId?: string;
      code?: string;
    };
    console.log('[addDownloadCouponItems] 응답:', JSON.stringify(data).slice(0, 300));
    return { requestTransactionId: data.requestTransactionId };
  } catch (err) {
    if (err instanceof CoupangApiError && (err.statusCode === 410 || err.statusCode === 404)) {
      console.warn(`[addDownloadCouponItems] marketplace_openapi ${err.statusCode} — FMS 폴백 시도`);
    } else {
      throw err;
    }
  }

  // 2차 폴백: FMS 프로바이더
  const fmsPath = `${FMS_BASE}/v1/vendors/${credentials.vendorId}/coupons/${couponId}/items`;
  console.log(`[addDownloadCouponItems] FMS 폴백: ${fmsPath}`);

  const data = await callCoupangApi(credentials, 'POST', fmsPath, body) as {
    requestTransactionId?: string;
    code?: string;
  };
  console.log('[addDownloadCouponItems] FMS 응답:', JSON.stringify(data).slice(0, 300));
  return { requestTransactionId: data.requestTransactionId };
}

/** 다운로드 쿠폰 요청 상태 확인 */
export async function checkDownloadCouponStatus(
  credentials: CoupangCredentials,
  requestTransactionId: string,
): Promise<unknown> {
  // FMS 프로바이더로 시도
  try {
    const fmsPath = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/requested/${requestTransactionId}`;
    return await callCoupangApi(credentials, 'GET', fmsPath);
  } catch {
    // 폴백: marketplace_openapi
    const path = `${MKT_OPENAPI_BASE}/coupons/transactionStatus?requestTransactionId=${requestTransactionId}`;
    return callCoupangApi(credentials, 'GET', path);
  }
}

/** 다운로드 쿠폰 아이템 등록 (레거시 호환 — 새 코드는 addDownloadCouponItems 사용) */
export async function applyDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<unknown> {
  return addDownloadCouponItems(credentials, couponId, vendorItemIds);
}

/** 즉시할인 쿠폰 아이템 수 조회 */
export async function getInstantCouponItemCount(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<number> {
  try {
    const path = `${FMS_BASE}/v1/vendors/${credentials.vendorId}/coupons/${couponId}/items`;
    const data = await callCoupangApi(credentials, 'GET', path) as { data?: unknown[] };
    return data.data?.length || 0;
  } catch {
    return 0;
  }
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
