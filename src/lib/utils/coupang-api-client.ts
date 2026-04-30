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

const API_CALL_TIMEOUT_MS = 30000; // 개별 API 호출 타임아웃 (30초)

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

  // AbortController로 개별 호출 타임아웃 보호
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CALL_TIMEOUT_MS);
  fetchInit.signal = controller.signal;

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CoupangApiError(`API 요청 타임아웃 (${API_CALL_TIMEOUT_MS / 1000}초)`, 504, 'TIMEOUT');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    // JSON 응답이면 errorMessage 필드에서 상세 원인 추출
    let detailMsg = errorBody;
    try {
      const errJson = JSON.parse(errorBody);
      detailMsg = errJson.errorMessage || errJson.message || errJson.resultMessage || errorBody;
    } catch { /* not JSON */ }
    console.error(`[callCoupangApi] HTTP ${response.status} ${method} ${path} — ${errorBody.slice(0, 500)}`);
    if (response.status === 401) {
      throw new CoupangApiError(`인증 실패 (401): ${detailMsg}`, 401, 'AUTH_FAILED');
    }
    if (response.status === 429) {
      throw new CoupangApiError('API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 429, 'RATE_LIMITED');
    }
    throw new CoupangApiError(
      `API 요청 실패 (${response.status}): ${detailMsg}`,
      response.status,
    );
  }

  const json = await response.json();

  // 쿠팡 API는 HTTP 200이어도 body에 code:"ERROR" 를 반환할 수 있음
  const resBody = json as Record<string, unknown>;
  const resCode = String(resBody.code || '').toUpperCase();
  const resResultCode = String(resBody.resultCode || '').toUpperCase();

  // 에러 코드 패턴 감지 (다양한 쿠팡 API 에러 형태)
  const isErrorCode = ['ERROR', 'FAIL', 'INVALID_ARGUMENT', 'FORBIDDEN', 'NOT_FOUND',
    'BAD_REQUEST', 'UNAUTHORIZED', 'DUPLICATE', 'CONFLICT', 'INVALID'].some(
    (e) => resCode.includes(e) || resResultCode.includes(e),
  );

  // success: false 패턴 감지 (비동기 상태 응답 제외)
  const dataObj = resBody.data as Record<string, unknown> | undefined;
  // ★ data.status가 있으면 비동기 상태 확인 응답(PROCESSING 등)이므로 에러 아님
  const hasAsyncStatus = !!dataObj?.status;
  const isSuccessFalse = dataObj?.success === false && !dataObj?.content && !dataObj?.requestedId && !hasAsyncStatus;

  if (isErrorCode || isSuccessFalse) {
    // errorMessage가 상세 원인 (message는 generic "Bad Request" 등)
    const msg = String(resBody.errorMessage || resBody.resultMessage || resBody.message || JSON.stringify(resBody).slice(0, 500));
    const errorCode = resCode || resResultCode || 'UNKNOWN_ERROR';
    console.error(`[callCoupangApi] ${method} ${path} — code=${errorCode}, success=${dataObj?.success}, 전체응답: ${JSON.stringify(resBody).slice(0, 500)}`);
    throw new CoupangApiError(`쿠팡 API 오류 (${errorCode}): ${msg}`, 200, errorCode);
  }

  // POST 요청의 경우 응답 로그 (디버깅용)
  if (method === 'POST') {
    console.log(`[callCoupangApi] ${method} ${path} — 응답: ${JSON.stringify(resBody).slice(0, 500)}`);
  }

  return json;
}

/** 월별 정산 데이터 조회 (전체 페이지 순회) */
export async function fetchSettlementData(
  credentials: CoupangCredentials,
  yearMonth: string,
  options?: { startDateOverride?: string; endDateOverride?: string },
): Promise<SettlementResponse> {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = options?.startDateOverride || `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = options?.endDateOverride || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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
    maxTimeMs?: number; // 최대 실행 시간 (ms) — 초과 시 현재까지 결과 + nextToken 반환
  },
): Promise<{ count: number; items: CoupangProductItem[]; rawResponse: unknown; nextToken?: string }> {
  const allItems: CoupangProductItem[] = [];
  let nextToken = options?.nextToken || '';
  let lastResponse: unknown = null;
  const maxPerPage = 100;
  const maxPages = options?.maxPages ?? 200;
  const status = options?.status ?? 'APPROVED';
  const startTime = Date.now();
  const maxTimeMs = options?.maxTimeMs ?? 0; // 0 = 무제한

  for (let page = 0; page < maxPages; page++) {
    // 시간 초과 체크 (다음 페이지 시작 전)
    if (maxTimeMs > 0 && (Date.now() - startTime) > maxTimeMs) {
      console.log(`[fetchProductListings] 시간 초과 (${Math.round((Date.now() - startTime) / 1000)}초/${maxTimeMs / 1000}초) — ${allItems.length}개 수집 후 중단, nextToken 보존`);
      break;
    }
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

    // nextToken을 즉시 캡처 (시간 초과로 중단되어도 보존)
    nextToken = data.nextToken || '';

    const products = Array.isArray(data.data) ? data.data : [];

    // 첫 페이지 진단 로그
    if (page === 0) {
      console.log(`[fetchProductListings] 응답 keys:`, Object.keys(data));
      console.log(`[fetchProductListings] data.data isArray:`, Array.isArray(data.data), `길이:`, products.length);
      if (products.length > 0) {
        console.log(`[fetchProductListings] 첫 상품 keys:`, Object.keys(products[0]));
      } else if (data.data && !Array.isArray(data.data)) {
        console.warn(`[fetchProductListings] data.data가 배열이 아님:`, typeof data.data, JSON.stringify(data.data).slice(0, 300));
      }
    }

    // 목록 API의 items가 비어있으면 상세 API 병렬 호출로 vendorItemId 획득
    const productsNeedingDetail = products.filter(
      (p) => !Array.isArray(p.items) || (p.items as unknown[]).length === 0,
    );

    // 10개씩 병렬 호출 (속도 최적화 — 429 에러 시 자동 재시도)
    const PARALLEL = 7;
    const detailMap = new Map<string, Array<Record<string, unknown>>>();

    for (let i = 0; i < productsNeedingDetail.length; i += PARALLEL) {
      // 상세 API 배치 시작 전 시간 체크
      if (maxTimeMs > 0 && (Date.now() - startTime) > maxTimeMs) {
        console.log(`[fetchProductListings] 상세 API 중 시간 초과 — ${i}/${productsNeedingDetail.length}개 처리 후 중단`);
        break;
      }
      const batch = productsNeedingDetail.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const spId = String(p.sellerProductId || '');
          const detailPath = `${SELLER_BASE_PATH}/seller-products/${spId}`;
          try {
            const detailData = await callCoupangApi(credentials, 'GET', detailPath) as Record<string, unknown>;
            const detail = (detailData.data || detailData) as Record<string, unknown>;
            return { spId, items: Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : [] };
          } catch (err) {
            // 429 rate limit → 1초 대기 후 재시도 1회
            if (err instanceof CoupangApiError && err.statusCode === 429) {
              await new Promise((r) => setTimeout(r, 1000));
              const retryData = await callCoupangApi(credentials, 'GET', detailPath) as Record<string, unknown>;
              const detail = (retryData.data || retryData) as Record<string, unknown>;
              return { spId, items: Array.isArray(detail.items) ? detail.items as Array<Record<string, unknown>> : [] };
            }
            throw err;
          }
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.items.length > 0) {
          detailMap.set(r.value.spId, r.value.items);
        }
      }
      if (i + PARALLEL < productsNeedingDetail.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (page === 0 && detailMap.size > 0) {
      const firstItems = detailMap.values().next().value;
      if (firstItems && firstItems.length > 0) {
        console.log(`[fetchProductListings] 상세API 첫 아이템 vendorItemId:`, firstItems[0].vendorItemId);
      }
    }

    for (const product of products) {
      const sellerProductId = String(product.sellerProductId || '');
      const sellerProductName = String(product.sellerProductName || product.productName || '');
      const createdAt = product.createdAt ? String(product.createdAt) : null;

      // 목록 API items 또는 상세 API items 사용
      let items = Array.isArray(product.items) ? product.items as Array<Record<string, unknown>> : [];
      if (items.length === 0) {
        items = detailMap.get(sellerProductId) || [];
      }

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
      }
    }

    // nextToken은 루프 상단에서 이미 캡처됨
    if (!nextToken) break;
  }

  if (maxTimeMs > 0) {
    console.log(`[fetchProductListings] 완료: ${allItems.length}개 수집, ${Math.round((Date.now() - startTime) / 1000)}초 소요`);
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

/**
 * 주문 기반 매출 수집 — 쿠팡 Wing 대시보드와 기준 일치
 *
 * revenue-history (정산 인식) 와 달리, ordersheets API 는
 * 주문 발생 즉시 조회 가능. Wing 우수판매자 "3개월 누적 매출" 과 같은 기준.
 *
 * 상태(status) 필터:
 *   undefined → 전체 (취소 포함). Wing 기본값과 가장 가까움.
 *   'DELIVERED' 계열 → 구매확정만 (보수적)
 *
 * 반환값: 기간 내 모든 orderItems 의 salesPrice 합계 + 건수
 */
export async function fetchOrderBasedSales(
  credentials: CoupangCredentials,
  yearMonth: string,
  options?: {
    status?: string;
    excludeCancelled?: boolean; // true 면 cancelRequested/cancelled 제외
  },
): Promise<{
  totalSales: number;
  orderCount: number;
  itemCount: number;
  yearMonth: string;
  rawSample: unknown;
}> {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  let endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // 쿠팡 ordersheets 는 오늘 포함 가능. 단 미래 날짜는 거부.
  const todayStr = new Date().toISOString().split('T')[0];
  if (endDate > todayStr) endDate = todayStr;
  if (startDate > todayStr) {
    return { totalSales: 0, orderCount: 0, itemCount: 0, yearMonth, rawSample: null };
  }

  // 쿠팡 ordersheets 는 status 가 필수. 여러 상태를 순회해 모든 주문 합산.
  //   기본: 전체 활성 상태 (ACCEPT~FINAL_DELIVERY). 오늘·실시간 매출까지 전부 집계.
  //   옵션.status 지정 시 해당 상태만.
  const statusList = options?.status
    ? [options.status]
    : ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];

  // 쿠팡 ordersheets 는 createdAtFrom/To 가 'yyyy-MM-dd' 형식 요구 (epoch ms 아님)
  const fromStr = startDate;
  const toStr = endDate;

  const excludeCancelled = options?.excludeCancelled ?? false;
  // ordersheets page 파라미터 반복 반환 버그 방어 — orderId 중복 검출 + 신규 0개면 break
  const seenOrderIds = new Set<string>();
  let totalSales = 0;
  let orderCount = 0;
  let itemCount = 0;
  let firstRawSample: unknown = null;

  for (const status of statusList) {
    const maxPages = 200;
    for (let page = 1; page <= maxPages; page++) {
      const queryParts = [
        `createdAtFrom=${fromStr}`,
        `createdAtTo=${toStr}`,
        `status=${status}`,
        `maxPerPage=50`,
        `page=${page}`,
      ];
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${credentials.vendorId}/ordersheets?${queryParts.join('&')}`;

      const data = await callCoupangApi(credentials, 'GET', path) as {
        data?: Array<Record<string, unknown>>;
        pagination?: { totalElements?: number; totalPages?: number; currentPage?: number };
      };

      if (firstRawSample === null) firstRawSample = data;

      const orders = Array.isArray(data.data) ? data.data : [];
      if (orders.length === 0) break;

      let newOrdersInPage = 0;
      for (const order of orders) {
        const oid = String(order.orderId || '');
        if (oid && seenOrderIds.has(oid)) continue;
        if (oid) seenOrderIds.add(oid);
        const orderStatus = String(order.status || '').toUpperCase();
        if (excludeCancelled && (orderStatus === 'CANCEL' || orderStatus === 'CANCELLED' || orderStatus === 'RETURN_DONE')) {
          continue;
        }
        newOrdersInPage++;
        orderCount++;
        const orderItems = Array.isArray(order.orderItems) ? order.orderItems as Array<Record<string, unknown>> : [];
        for (const item of orderItems) {
          const itemStatus = String(item.status || '').toUpperCase();
          if (excludeCancelled && (itemStatus === 'CANCEL' || itemStatus === 'CANCELLED')) continue;
          itemCount++;
          const unitPrice = Number(item.salesPrice ?? item.orderPrice ?? 0);
          const qty = Number(item.shippingCount ?? item.shippingNumberSum ?? 1);
          totalSales += unitPrice * qty;
        }
      }

      if (newOrdersInPage === 0) break;
      const totalPages = data.pagination?.totalPages;
      if (totalPages && page >= totalPages) break;
      if (orders.length < 50) break;
    }
  }

  return { totalSales, orderCount, itemCount, yearMonth, rawSample: firstRawSample };
}

/**
 * 오늘 실시간 매출 — 오늘 날짜에 발생한 모든 주문 합계
 *
 * ordersheets API 로 오늘 날짜만 조회. 모든 상태(ACCEPT~FINAL_DELIVERY) 포함.
 * Wing 대시보드 '오늘 매출' 과 근접.
 */
export async function fetchTodaySales(
  credentials: CoupangCredentials,
): Promise<{
  totalSales: number;
  orderCount: number;
  itemCount: number;
  date: string;
}> {
  const now = new Date();
  // KST(UTC+9) 기준 오늘
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const today = kstNow.toISOString().split('T')[0];
  const [y, m] = today.split('-');

  // 쿠팡 ordersheets v4 의 page 파라미터는 무시되는 경우가 있음(같은 50개 무한 반복 → 38배 부풀림 발생).
  // orderId 중복 검출 + 신규 0개면 break 로 안전화. 전체 status 에 걸쳐 dedup.
  const statusList = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];
  const seenOrderIds = new Set<string>();
  let totalSales = 0;
  let orderCount = 0;
  let itemCount = 0;

  for (const status of statusList) {
    for (let page = 1; page <= 200; page++) {
      const queryParts = [
        `createdAtFrom=${today}`,
        `createdAtTo=${today}`,
        `status=${status}`,
        `maxPerPage=50`,
        `page=${page}`,
      ];
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${credentials.vendorId}/ordersheets?${queryParts.join('&')}`;
      const data = await callCoupangApi(credentials, 'GET', path) as {
        data?: Array<Record<string, unknown>>;
        pagination?: { totalPages?: number };
      };
      const orders = Array.isArray(data.data) ? data.data : [];
      if (orders.length === 0) break;
      let newOrdersInPage = 0;
      for (const order of orders) {
        const oid = String(order.orderId || '');
        if (oid && seenOrderIds.has(oid)) continue;
        if (oid) seenOrderIds.add(oid);
        newOrdersInPage++;
        orderCount++;
        const orderItems = Array.isArray(order.orderItems) ? order.orderItems as Array<Record<string, unknown>> : [];
        for (const item of orderItems) {
          itemCount++;
          const unitPrice = Number(item.salesPrice ?? item.orderPrice ?? 0);
          const qty = Number(item.shippingCount ?? item.shippingNumberSum ?? 1);
          totalSales += unitPrice * qty;
        }
      }
      // 새 주문이 없으면 페이지네이션이 동일 페이지 반복 중 → break
      if (newOrdersInPage === 0) break;
      const totalPages = data.pagination?.totalPages;
      if (totalPages && page >= totalPages) break;
      if (orders.length < 50) break;
    }
  }

  // 간단 로그: 오늘 yyyy-MM-dd · 주문/아이템/매출
  console.log(`[fetchTodaySales] ${y}-${m}-${today.split('-')[2]}: orders=${orderCount}, items=${itemCount}, sales=${totalSales}`);

  return { totalSales, orderCount, itemCount, date: today };
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
  return Array.isArray(data.data) ? data.data : [];
}

/** 즉시할인 쿠폰 생성 — 비동기 (requestedId 반환)
 *  쿠팡 FMS API 필드: name, startAt, endAt, type, discount, maxDiscountPrice, contractId
 *  응답: { code:200, data: { success, content: { requestedId } } } */
export async function createInstantCoupon(
  credentials: CoupangCredentials,
  params: CreateInstantCouponParams,
): Promise<{ requestedId: string; couponName: string }> {
  const path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupon`;
  const body = {
    name: params.title,
    startAt: params.startDate,
    endAt: params.endDate,
    type: params.discountType,           // 'RATE' | 'FIXED' | 'FIXED_WITH_QUANTITY' | 'PRICE'
    discount: params.discountValue,
    maxDiscountPrice: Math.max(params.maxDiscountPrice || 10, 10), // 최소 10원
    contractId: params.contractId,
  };
  console.log('[createInstantCoupon] 요청:', JSON.stringify(body).slice(0, 500));
  const rawData = await callCoupangApi(credentials, 'POST', path, body) as Record<string, unknown>;
  console.log('[createInstantCoupon] 응답:', JSON.stringify(rawData).slice(0, 500));

  // 응답: { code:200, data: { success, content: { requestedId, success } } }
  const data = rawData.data as Record<string, unknown> | undefined;
  if (!data) throw new CoupangApiError('즉시할인 쿠폰 생성 응답에 data가 없습니다.', 500);

  const content = data.content as Record<string, unknown> | undefined;
  const requestedId = String(content?.requestedId || data.requestedId || '');

  if (!requestedId) {
    throw new CoupangApiError(`즉시할인 쿠폰 생성 실패: requestedId 없음. 응답: ${JSON.stringify(rawData).slice(0, 300)}`, 500);
  }

  return { requestedId, couponName: params.title };
}

/** 즉시할인 쿠폰 아이템 추가 (상품에 쿠폰 연결) — 비동기 (requestedId 반환)
 *
 *  쿠팡 FMS coupon-items API:
 *  - POST /api/v2/vendors/{vendorId}/coupons/{couponId}/items  (v2 우선 시도)
 *  - POST /api/v1/vendors/{vendorId}/coupons/{couponId}/items  (v1 폴백)
 *  - body: { vendorItemIds: [number, ...] }  (vendorItems도 동시 전송 — 호환성)
 *  - 쿠팡 Wing "총 1건"은 1 API 배치 요청을 의미 (내부적으로 N개 아이템 처리) */
export async function applyInstantCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<{ requestedId?: string }> {
  const numericIds = vendorItemIds.map(Number).filter((n) => !isNaN(n));

  console.log(`[applyInstantCoupon] 쿠폰 ${couponId}에 ${numericIds.length}개 아이템 등록 요청, 샘플: [${numericIds.slice(0, 5).join(',')}...]`);

  // ★ 필드명 호환성: vendorItemIds(공식 문서 추정) + vendorItems(레거시) 동시 전송
  //   쿠팡 API는 인식하는 필드만 사용, 나머지 무시
  const body = { vendorItemIds: numericIds, vendorItems: numericIds };

  // v2 엔드포인트 우선 시도 (쿠폰 생성/조회가 v2이므로)
  const v2Path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupons/${couponId}/items`;
  const v1Path = `${FMS_BASE}/v1/vendors/${credentials.vendorId}/coupons/${couponId}/items`;

  let result: Record<string, unknown>;
  try {
    result = await callCoupangApi(credentials, 'POST', v2Path, body) as Record<string, unknown>;
    console.log(`[applyInstantCoupon] v2 성공`);
  } catch (v2Err) {
    // v2 실패(404/410) → v1 폴백
    const isRetired = v2Err instanceof CoupangApiError && (v2Err.statusCode === 404 || v2Err.statusCode === 410);
    if (isRetired) {
      console.log(`[applyInstantCoupon] v2 미지원 (${(v2Err as CoupangApiError).statusCode}) → v1 폴백`);
      result = await callCoupangApi(credentials, 'POST', v1Path, body) as Record<string, unknown>;
    } else {
      throw v2Err;
    }
  }

  // 응답: { code:200, data: { success, content: { requestedId } } }
  const data = (result.data || result) as Record<string, unknown>;
  const content = (data.content || data) as Record<string, unknown>;
  const requestedId = String(
    content.requestedId || data.requestedId || result.requestedId
    || content.requestTransactionId || data.requestTransactionId || '',
  );
  console.log(`[applyInstantCoupon] 응답 — requestedId: ${requestedId || '없음'}, 전체: ${JSON.stringify(result).slice(0, 500)}`);
  return { requestedId: requestedId || undefined };
}

/** 즉시할인 쿠폰 요청 상태 확인 */
export async function checkInstantCouponStatus(
  credentials: CoupangCredentials,
  requestedId: string,
): Promise<unknown> {
  // v2 우선, v1 폴백
  const v2Path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/requested/${requestedId}`;
  const v1Path = `${FMS_BASE}/v1/vendors/${credentials.vendorId}/requested/${requestedId}`;
  try {
    return await callCoupangApi(credentials, 'GET', v2Path);
  } catch (err) {
    if (err instanceof CoupangApiError && (err.statusCode === 404 || err.statusCode === 410)) {
      return callCoupangApi(credentials, 'GET', v1Path);
    }
    throw err;
  }
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

/** 다운로드 쿠폰 단건 조회 (couponId)
 *
 *  쿠팡 공식 API:
 *  GET /v2/providers/marketplace_openapi/apis/api/v1/coupons/{couponId}
 *  응답: { couponId, title, couponType, couponStatus, couponPolicies, ... } (직접 객체, data 래핑 없음) */
export async function fetchDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<CoupangCoupon | null> {
  // 1차: marketplace_openapi 단건 조회 (공식 다운로드 쿠폰 조회 엔드포인트)
  const path = `${MKT_OPENAPI_BASE}/coupons/${couponId}`;
  console.log(`[fetchDownloadCoupon] 다운로드 쿠폰 조회: ${path}`);

  try {
    const raw = await callCoupangApi(credentials, 'GET', path) as Record<string, unknown>;
    console.log('[fetchDownloadCoupon] 응답:', JSON.stringify(raw).slice(0, 500));

    // 쿠팡 API 응답은 직접 객체 또는 { data: { ... } } 형태일 수 있음
    const couponData = (raw.data || raw) as Record<string, unknown>;

    if (couponData.couponId) {
      return {
        couponId: Number(couponData.couponId),
        couponName: String(couponData.title || ''),
        couponStatus: String(couponData.couponStatus || ''),
        contractId: Number(couponData.contractId || 0),
        startDate: String(couponData.startDate || ''),
        endDate: String(couponData.endDate || ''),
        policies: (couponData.couponPolicies || couponData.policies || []) as unknown[],
      };
    }

    console.warn('[fetchDownloadCoupon] 응답에 couponId 없음:', Object.keys(couponData));
    return null;
  } catch (err) {
    console.error('[fetchDownloadCoupon] 조회 실패:', err instanceof Error ? err.message : err);
    if (err instanceof CoupangApiError) {
      console.error(`[fetchDownloadCoupon] HTTP ${err.statusCode}`);
    }
    return null;
  }
}

/** 쿠팡 API 날짜 형식 변환 (ISO/Date → KST 'YYYY-MM-DD HH:mm:ss')
 *  쿠팡 API는 KST(UTC+9) 기준 — Vercel은 UTC이므로 변환 필요 */
export function toCoupangDateFormat(isoDate: string | Date): string {
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  // KST = UTC + 9시간
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const M = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const H = String(kst.getUTCHours()).padStart(2, '0');
  const m = String(kst.getUTCMinutes()).padStart(2, '0');
  const s = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${y}-${M}-${d} ${H}:${m}:${s}`;
}

/** 다운로드 쿠폰 정책 배열을 쿠팡 API 형식으로 정규화
 *  쿠팡 공식 스펙(Body Parameter): title, typeOfDiscount, description, minimumPrice,
 *  discount, maximumDiscountPrice, maximumPerDaily 7개. 별칭 필드는 보내지 않음. */
function normalizePolicies(policies: unknown[]): Record<string, unknown>[] {
  return policies.map((p, i) => {
    const policy = p as Record<string, unknown>;
    const perDaily = Math.min(Math.max(
      Number(policy.maximumPerDaily || policy.maximumPerDay || policy.maxPerDaily || 9999),
      1,
    ), 9999);
    return {
      title: policy.title || `할인 정책 ${i + 1}`,
      typeOfDiscount: policy.typeOfDiscount || 'RATE',
      description: policy.description || `할인 정책 ${i + 1}`,
      minimumPrice: Number(policy.minimumPrice || 0),
      discount: Number(policy.discount || 0),
      maximumDiscountPrice: Number(policy.maximumDiscountPrice || 0),
      maximumPerDaily: perDaily,
    };
  });
}

/** 다운로드 쿠폰 생성 (공식 스펙 7필드만 전송 — 아이템 등록은 별도 API)
 *
 *  쿠팡 공식 API:
 *  - POST /v2/providers/marketplace_openapi/apis/api/v1/coupons
 *  - body: { title, contractId, couponType:"DOWNLOAD", startDate, endDate, userId, policies }
 *  - 응답: { couponId, ... } 즉시 반환
 *  - 아이템(vendorItemIds) 등록은 별도 API 호출 (addDownloadCouponItems) */
export async function createDownloadCoupon(
  credentials: CoupangCredentials,
  params: CreateDownloadCouponParams,
): Promise<CoupangCoupon> {
  const mktPath = `${MKT_OPENAPI_BASE}/coupons`;
  const body: Record<string, unknown> = {
    title: params.title,
    contractId: Number(params.contractId),
    couponType: 'DOWNLOAD',
    startDate: toCoupangDateFormat(params.startDate),
    endDate: toCoupangDateFormat(params.endDate),
    userId: credentials.vendorId,
    policies: normalizePolicies(params.policies),
  };

  console.log('[createDownloadCoupon] 요청 경로:', mktPath);
  console.log('[createDownloadCoupon] 요청 body:', JSON.stringify(body).slice(0, 800));

  // marketplace_openapi — 다운로드 쿠폰의 유일한 공식 엔드포인트
  // FMS는 즉시할인 전용이므로 다운로드 쿠폰 생성 불가 (type=RATE/PRICE만 허용)
  const data = await callCoupangApi(credentials, 'POST', mktPath, body) as Record<string, unknown>;

  console.log('[createDownloadCoupon] 응답 전체:', JSON.stringify(data).slice(0, 1000));

  // 응답에서 couponId 또는 requestTransactionId 추출 (다양한 구조 대응)
  const nested = (data.data || data.content || data) as Record<string, unknown>;
  const couponId = Number(nested.couponId || nested.id || data.couponId || data.id || 0);
  const txId = String(
    data.requestTransactionId || data.requestedId ||
    nested.requestTransactionId || nested.requestedId || '',
  );

  if (couponId > 0) {
    return {
      couponId,
      couponName: String(nested.couponName || nested.title || params.title),
      couponStatus: String(nested.couponStatus || nested.status || 'CREATED'),
    };
  }

  if (txId) {
    return {
      couponId: 0,
      couponName: params.title,
      couponStatus: 'PENDING',
      requestTransactionId: txId,
    } as CoupangCoupon & { requestTransactionId: string };
  }

  throw new CoupangApiError(
    `다운로드 쿠폰 생성 실패: ${data.message || data.errorMessage || JSON.stringify(data).slice(0, 300)}`,
    500,
  );
}

/** 다운로드 쿠폰에 아이템 등록 (쿠폰 생성 후 별도 호출)
 *
 *  쿠팡 공식 API:
 *  - PUT /v2/providers/marketplace_openapi/apis/api/v1/coupon-items
 *  - body: { couponItems: [{ couponId, userId, vendorItemIds: [number, ...] }] }
 *  - 한 번에 100개 초과 불가
 *  - 상품 추가 실패 시 해당 쿠폰 파기됨 */
export async function addDownloadCouponItems(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<{ couponId?: number; requestResultStatus?: string }> {
  const numericIds = vendorItemIds.map(Number).filter((n) => !isNaN(n));

  // 쿠팡 공식 스펙: PUT /coupon-items, body: { couponItems: [...] }
  // ★ 참고: 쿠팡 문서에 따르면 생성 시 vendorItemIds 포함이 권장됨.
  //   이 함수는 폴백용으로만 유지.
  const mktPath = `${MKT_OPENAPI_BASE}/coupon-items`;
  const body = {
    couponItems: [{
      couponId: Number(couponId),  // ★ Number 타입 (쿠팡 API 스펙)
      userId: credentials.vendorId,
      vendorItemIds: numericIds,
    }],
  };

  console.log(`[addDownloadCouponItems] PUT ${mktPath} — 쿠폰 ${couponId}에 ${numericIds.length}개 아이템 등록`);
  console.log(`[addDownloadCouponItems] body: ${JSON.stringify(body).slice(0, 500)}`);

  const rawData = await callCoupangApi(credentials, 'PUT', mktPath, body) as Record<string, unknown>;

  console.log('[addDownloadCouponItems] 응답 전체:', JSON.stringify(rawData).slice(0, 800));

  // 응답이 { data: { requestResultStatus, body } } 또는 { requestResultStatus, body } 형태일 수 있음
  const data = (rawData.data || rawData) as Record<string, unknown>;
  const status = String(data.requestResultStatus || rawData.requestResultStatus || '');
  const resultBody = (data.body || rawData.body) as Record<string, unknown> | undefined;
  const errorMsg = String(data.errorMessage || rawData.errorMessage || '');
  const errorCode = String(data.errorCode || rawData.errorCode || '');

  // 에러 체크
  if (status === 'FAIL') {
    throw new CoupangApiError(
      `다운로드 쿠폰 아이템 등록 실패: ${errorMsg || errorCode || '알 수 없는 오류'}`,
      400,
      errorCode,
    );
  }

  return {
    couponId: resultBody?.couponId as number | undefined,
    requestResultStatus: status || 'SUCCESS', // API가 200 반환했으면 성공으로 간주
  };
}

/** 다운로드 쿠폰 요청 상태 확인
 *  다운로드 쿠폰은 marketplace_openapi에서 생성하므로 marketplace_openapi 사용 */
export async function checkDownloadCouponStatus(
  credentials: CoupangCredentials,
  requestTransactionId: string,
): Promise<unknown> {
  const mktPath = `${MKT_OPENAPI_BASE}/coupons/transactionStatus?requestTransactionId=${requestTransactionId}`;
  console.log(`[checkDownloadCouponStatus] 조회: ${mktPath}`);
  const result = await callCoupangApi(credentials, 'GET', mktPath);
  console.log(`[checkDownloadCouponStatus] 응답: ${JSON.stringify(result).slice(0, 500)}`);
  return result;
}

/** 다운로드 쿠폰 아이템 등록 (레거시 호환 — 새 코드는 addDownloadCouponItems 사용) */
export async function applyDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
  vendorItemIds: (string | number)[],
): Promise<unknown> {
  return addDownloadCouponItems(credentials, couponId, vendorItemIds);
}

/** 즉시할인 쿠폰 아이템 수 조회 (v2→v1 폴백) */
export async function getInstantCouponItemCount(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<number> {
  const v2Path = `${FMS_BASE}/v2/vendors/${credentials.vendorId}/coupons/${couponId}/items`;
  const v1Path = `${FMS_BASE}/v1/vendors/${credentials.vendorId}/coupons/${couponId}/items`;
  try {
    const data = await callCoupangApi(credentials, 'GET', v2Path) as { data?: unknown[] };
    return data.data?.length || 0;
  } catch (v2Err) {
    // v2 미지원(404/410) → v1 폴백
    if (v2Err instanceof CoupangApiError && (v2Err.statusCode === 404 || v2Err.statusCode === 410)) {
      try {
        const data = await callCoupangApi(credentials, 'GET', v1Path) as { data?: unknown[] };
        return data.data?.length || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }
}

// ── 쿠폰 검증 함수들 ────────────────────────────────────

export interface CouponVerifyResult {
  couponId: string;
  couponType: 'instant' | 'download';
  exists: boolean;
  status: string;         // 쿠팡 상태 (사용중, ACTIVE, etc.)
  itemCount?: number;     // 등록된 아이템 수
  message: string;
}

/** 즉시할인 쿠폰이 쿠팡에 실제 존재하는지 검증 */
export async function verifyInstantCoupon(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<CouponVerifyResult> {
  try {
    // 쿠폰 목록에서 해당 쿠폰 존재 여부 확인
    const coupons = await fetchInstantCoupons(credentials);
    const found = coupons.find((c) => c.couponId === couponId);

    if (!found) {
      return {
        couponId: String(couponId),
        couponType: 'instant',
        exists: false,
        status: 'NOT_FOUND',
        message: `즉시할인 쿠폰 ${couponId}가 쿠팡에서 찾을 수 없습니다.`,
      };
    }

    // 아이템 수 확인
    const itemCount = await getInstantCouponItemCount(credentials, couponId);

    return {
      couponId: String(couponId),
      couponType: 'instant',
      exists: true,
      status: found.couponStatus || 'ACTIVE',
      itemCount,
      message: `즉시할인 쿠폰 확인됨: ${found.couponName || couponId} (상태: ${found.couponStatus}, 아이템: ${itemCount}개)`,
    };
  } catch (err) {
    return {
      couponId: String(couponId),
      couponType: 'instant',
      exists: false,
      status: 'ERROR',
      message: `즉시할인 쿠폰 검증 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** 다운로드 쿠폰이 쿠팡에 실제 존재하는지 검증 */
export async function verifyDownloadCoupon(
  credentials: CoupangCredentials,
  couponId: number,
): Promise<CouponVerifyResult> {
  try {
    // 단건 조회 API로 확인
    const coupon = await fetchDownloadCoupon(credentials, couponId);

    if (!coupon) {
      return {
        couponId: String(couponId),
        couponType: 'download',
        exists: false,
        status: 'NOT_FOUND',
        message: `다운로드 쿠폰 ${couponId}가 쿠팡에서 찾을 수 없습니다.`,
      };
    }

    return {
      couponId: String(couponId),
      couponType: 'download',
      exists: true,
      status: coupon.couponStatus || 'ACTIVE',
      message: `다운로드 쿠폰 확인됨: ${coupon.couponName || couponId} (상태: ${coupon.couponStatus})`,
    };
  } catch (err) {
    return {
      couponId: String(couponId),
      couponType: 'download',
      exists: false,
      status: 'ERROR',
      message: `다운로드 쿠폰 검증 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** 즉시할인 비동기 요청 상태를 최종 확인 (requestedId로 조회) */
export async function verifyInstantCouponRequest(
  credentials: CoupangCredentials,
  requestedId: string,
): Promise<{ status: string; failReason?: string; raw: unknown }> {
  try {
    const result = await checkInstantCouponStatus(credentials, requestedId) as Record<string, unknown>;
    const nested = (result.data || result) as Record<string, unknown>;
    const status = String(nested.status || nested.couponStatus || result.status || '').toUpperCase();
    const failReason = String(nested.message || nested.failReason || '');
    return { status, failReason: failReason || undefined, raw: result };
  } catch (err) {
    return { status: 'ERROR', failReason: err instanceof Error ? err.message : String(err), raw: null };
  }
}

/** 다운로드 비동기 요청 상태를 최종 확인 (requestTransactionId로 조회) */
export async function verifyDownloadCouponRequest(
  credentials: CoupangCredentials,
  requestTransactionId: string,
): Promise<{ status: string; couponId?: number; failReason?: string; raw: unknown }> {
  try {
    const result = await checkDownloadCouponStatus(credentials, requestTransactionId) as Record<string, unknown>;
    const nested = (result.data || result) as Record<string, unknown>;
    const status = String(nested.status || result.status || '').toUpperCase();
    const couponId = Number(nested.couponId || result.couponId || 0);
    const failReason = String(nested.message || nested.failReason || '');
    return { status, couponId: couponId > 0 ? couponId : undefined, failReason: failReason || undefined, raw: result };
  } catch (err) {
    return { status: 'ERROR', failReason: err instanceof Error ? err.message : String(err), raw: null };
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
