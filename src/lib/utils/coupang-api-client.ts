/**
 * 쿠팡 Open API 클라이언트
 * 서버 사이드에서만 사용
 */

import { formatSignedDate, buildAuthorizationHeader } from './coupang-hmac';

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

  const response = await fetch(`${API_DOMAIN}${path}`, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': credentials.vendorId,
    },
  });

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

/** 월별 정산 데이터 조회 */
export async function fetchSettlementData(
  credentials: CoupangCredentials,
  yearMonth: string,
): Promise<SettlementResponse> {
  // yearMonth: "2025-03" -> startDate: "2025-03-01", endDate: "2025-03-31"
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const path = `${REVENUE_BASE_PATH}/revenue-history?vendorId=${credentials.vendorId}&recognitionDateFrom=${startDate}&recognitionDateTo=${endDate}`;

  const data = await callCoupangApi(credentials, 'GET', path) as {
    data?: Array<{
      settlementDate?: string;
      orderId?: string;
      vendorItemName?: string;
      salePrice?: number;
      coupangFee?: number;
      settlementPrice?: number;
      shippingPrice?: number;
      returnShippingPrice?: number;
    }>;
  };

  const items: SettlementItem[] = (data.data || []).map((item) => ({
    settlementDate: item.settlementDate || '',
    orderId: item.orderId || '',
    vendorItemName: item.vendorItemName || '',
    salePrice: item.salePrice || 0,
    commission: item.coupangFee || 0,
    settlementAmount: item.settlementPrice || 0,
    shippingFee: item.shippingPrice || 0,
    returnFee: item.returnShippingPrice || 0,
  }));

  const totalSales = items.reduce((sum, i) => sum + i.salePrice, 0);
  const totalCommission = items.reduce((sum, i) => sum + i.commission, 0);
  const totalShipping = items.reduce((sum, i) => sum + i.shippingFee, 0);
  const totalReturns = items.reduce((sum, i) => sum + i.returnFee, 0);
  const totalSettlement = items.reduce((sum, i) => sum + i.settlementAmount, 0);

  return {
    totalSettlement,
    totalSales,
    totalCommission,
    totalShipping,
    totalReturns,
    items,
    rawResponse: data,
  };
}

/** 상품 목록 조회 (오늘 등록 상품 수 카운트용) */
export async function fetchProductListings(
  credentials: CoupangCredentials,
  dateFrom: string,
  dateTo: string,
): Promise<{ count: number; rawResponse: unknown }> {
  const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&createdAtFrom=${dateFrom}&createdAtTo=${dateTo}&status=APPROVED`;

  const data = await callCoupangApi(credentials, 'GET', path) as {
    data?: Array<Record<string, unknown>>;
    pagination?: { totalElements?: number };
  };

  const count = data.pagination?.totalElements ?? (data.data?.length ?? 0);

  return { count, rawResponse: data };
}

/** 전체 등록 상품 수 조회 (날짜 무관, 총 누적 건수) */
export async function fetchTotalProductCount(
  credentials: CoupangCredentials,
): Promise<{ count: number; rawResponse: unknown }> {
  const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&status=APPROVED`;

  const data = await callCoupangApi(credentials, 'GET', path) as {
    data?: Array<Record<string, unknown>>;
    pagination?: { totalElements?: number };
  };

  const count = data.pagination?.totalElements ?? (data.data?.length ?? 0);

  return { count, rawResponse: data };
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
    return { valid: false, message: 'API 연결에 실패했습니다.' };
  }
}
