/**
 * 네이버 커머스 API (스마트스토어) 어댑터
 *
 * 공식 문서: https://apicenter.commerce.naver.com
 * GitHub: https://github.com/commerce-api-naver/commerce-api
 *
 * 인증: OAuth 2.0 Client Credentials + bcrypt 서명
 * Base URL: https://api.commerce.naver.com/external
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import bcrypt from 'bcryptjs';

const NAVER_API_BASE = 'https://api.commerce.naver.com/external';

export class NaverAdapter extends BaseAdapter {
  channel: Channel = 'naver';
  private clientId = '';
  private clientSecret = ''; // bcrypt salt (starts with $2a$)
  private accessToken = '';
  private tokenExpiresAt = 0;

  /**
   * OAuth 2.0 토큰 발급
   * - timestamp: 현재 시간 - 3초 (밀리초)
   * - password: {clientId}_{timestamp}
   * - clientSecretSign: Base64(bcrypt(password, clientSecret))
   */
  private async fetchToken(): Promise<string> {
    const timestamp = String(Math.round(Date.now() - 3000));
    const password = `${this.clientId}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, this.clientSecret);
    const clientSecretSign = Buffer.from(hashed).toString('base64');

    const params = new URLSearchParams({
      client_id: this.clientId,
      timestamp,
      client_secret_sign: clientSecretSign,
      grant_type: 'client_credentials',
      type: 'SELF',
    });

    const res = await fetch(
      `${NAVER_API_BASE}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`네이버 토큰 발급 실패: ${res.status} ${text}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 만료 1분 전 갱신
    return this.accessToken;
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      return this.fetchToken();
    }
    return this.accessToken;
  }

  private async naverApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.ensureToken();
    const url = `${NAVER_API_BASE}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.apiCall<T>(url, options);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.clientId = credentials.clientId as string;
    this.clientSecret = credentials.clientSecret as string;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      this.clientId = credentials.clientId as string;
      this.clientSecret = credentials.clientSecret as string;
      await this.fetchToken();
      return { success: true, message: '네이버 스마트스토어 연결 성공' };
    } catch (err) {
      return { success: false, message: `네이버 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  async getProducts(params: { page?: number; size?: number; status?: string }) {
    const { page = 1, size = 100 } = params;
    // 네이버는 상품 검색이 POST (v1)
    const data = await this.naverApi<{ contents: unknown[]; totalElements: number }>(
      'POST',
      '/v1/products/search',
      { page, size },
    );
    return { items: (data.contents || []) as Record<string, unknown>[], totalCount: data.totalElements || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.naverApi<{ originProductNo: string; smartstoreChannelProductNo: string }>(
      'POST', '/v2/products', product,
    );
    return { channelProductId: data.smartstoreChannelProductNo || data.originProductNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    // 원상품 번호 기반 수정
    await this.naverApi('PUT', `/v2/products/origin-products/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.naverApi('DELETE', `/v2/products/origin-products/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.naverApi('PUT', `/v2/products/origin-products/${channelProductId}`, {
      originProduct: { salePrice: price },
    });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.naverApi('PUT', `/v2/products/origin-products/${channelProductId}`, {
      originProduct: { stockQuantity: stock },
    });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.naverApi('PUT', `/v2/products/channel-products/${channelProductId}`, {
      channelProductDisplayStatusType: 'SUSPENSION',
    });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.naverApi('PUT', `/v2/products/channel-products/${channelProductId}`, {
      channelProductDisplayStatusType: 'ON',
    });
    return { success: true };
  }

  // ── 주문 ──

  /**
   * 변경된 상품 주문 내역 조회 (last-changed-statuses → query)
   * 주의: 쿼리 범위 최대 24시간 제한
   */
  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate } = params;

    // 1단계: 변경된 주문 ID 가져오기
    const changedQuery = new URLSearchParams({
      lastChangedFrom: `${startDate}T00:00:00.000+09:00`,
      lastChangedTo: `${endDate}T23:59:59.000+09:00`,
    });
    if (params.status) changedQuery.set('lastChangedType', params.status);

    const changed = await this.naverApi<{ data: { lastChangeStatuses: { productOrderId: string }[] } }>(
      'GET',
      `/v1/pay-order/seller/product-orders/last-changed-statuses?${changedQuery.toString()}`,
    );

    const productOrderIds = (changed.data?.lastChangeStatuses || []).map(s => s.productOrderId);
    if (productOrderIds.length === 0) {
      return { items: [], totalCount: 0 };
    }

    // 2단계: 주문 상세 조회
    const details = await this.naverApi<{ data: unknown[] }>(
      'POST',
      '/v1/pay-order/seller/product-orders/query',
      { productOrderIds },
    );

    return { items: (details.data || []) as Record<string, unknown>[], totalCount: productOrderIds.length };
  }

  async confirmOrder(channelOrderId: string) {
    await this.naverApi('POST', '/v1/pay-order/seller/product-orders/confirm', {
      productOrderIds: [channelOrderId],
    });
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.naverApi('POST', '/v1/pay-order/seller/product-orders/dispatch', {
      dispatchProductOrders: [{
        productOrderId: channelOrderId,
        deliveryMethod: 'DELIVERY',
        deliveryCompanyCode: courierCode,
        trackingNumber: invoiceNumber,
      }],
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.naverApi('POST', '/v1/pay-order/seller/product-orders/cancel', {
      productOrderId: channelOrderId,
      cancelReason: reason,
    });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.naverApi<{ contents: unknown[]; totalElements: number }>(
      'POST', '/v1/pay-user/inquiries',
      { page, size: 50 },
    );
    return { items: (data.contents || []) as Record<string, unknown>[], totalCount: data.totalElements || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.naverApi('POST', `/v1/pay-user/inquiries/${inquiryId}/answer`, { content: answer });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    // 네이버 정산은 주문 기반으로 조회
    const data = await this.naverApi<{ data: unknown[] }>(
      'GET', `/v1/pay-order/seller/settlements?from=${params.startDate}&to=${params.endDate}`,
    );
    return { items: (data.data || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    const data = await this.naverApi<unknown[]>('GET', '/v1/categories');
    // 전체 카테고리 트리에서 parentId 필터링
    const all = (data || []) as { id: string; name: string; parentCategoryId?: string }[];
    const filtered = parentId
      ? all.filter(c => c.parentCategoryId === parentId)
      : all.filter(c => !c.parentCategoryId);
    return {
      items: filtered.map(c => ({ id: String(c.id), name: c.name, parentId: c.parentCategoryId })),
    };
  }

  async searchCategory(keyword: string) {
    // 네이버는 카테고리 검색 전용 API가 없으므로 전체 조회 후 필터링
    const data = await this.naverApi<unknown[]>('GET', '/v1/categories');
    const all = (data || []) as { id: string; name: string; wholeCategoryName?: string }[];
    const matched = all.filter(c =>
      c.name?.includes(keyword) || c.wholeCategoryName?.includes(keyword)
    );
    return {
      items: matched.slice(0, 20).map(c => ({
        id: String(c.id),
        name: c.name,
        path: c.wholeCategoryName || c.name,
      })),
    };
  }
}
