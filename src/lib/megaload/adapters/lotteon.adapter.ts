/**
 * 롯데온 Open API 어댑터
 *
 * 공식 문서: https://api.lotteon.com/apiGuide (Nuxt.js SPA — 브라우저 접근 필요)
 * 스테이징: https://stg-api.lotteon.com
 * 스토어 센터: https://store.lotteon.com
 *
 * 인증: Token-based (Identity endpoint → Bearer 토큰)
 * - 판매자 ID + API Key + 거래처번호 필요
 * - API Key는 스토어센터 > 판매자정보 > OpenAPI 관리에서 발급 (1년 유효)
 * - IP 화이트리스트 필수 (서버 IP 등록)
 *
 * API 그룹:
 * - 상품관리 (menuIdx=4): 등록(87), 수정(90), 상태변경(92), 목록(93), 상세(94), 재고(86)
 * - 주문/배송 (menuIdx=9): 출고지시조회(209), 배송상태통보(137), 배송상태조회(140), Identity(207)
 * - 클레임/CS (menuIdx=7): 반품취소목록(67)
 * - 주문정보 (menuIdx=13): 주문정보등록(263)
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';

// 운영 API: ecapi.lotteon.com, 문서 포털: api.lotteon.com
const LOTTEON_API_BASE = 'https://ecapi.lotteon.com';

export class LotteonAdapter extends BaseAdapter {
  channel: Channel = 'lotteon';
  private sellerId = '';        // 판매자 ID
  private apiKey = '';          // API Key (인증키)
  private accountNo = '';       // 거래처번호
  private accessToken = '';
  private tokenExpiresAt = 0;

  /**
   * Identity 토큰 발급 (apiNo=207)
   */
  private async fetchToken(): Promise<string> {
    const res = await fetch(`https://ecapi.lotteon.com/api/v1/token/identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerId: this.sellerId,
        apiKey: this.apiKey,
        accountNo: this.accountNo,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`롯데온 토큰 발급 실패: ${res.status} ${text}`);
    }

    const data = await res.json() as { token: string; expiresIn?: number };
    this.accessToken = data.token;
    // 토큰 만료 시간 (기본 1시간으로 가정)
    this.tokenExpiresAt = Date.now() + ((data.expiresIn || 3600) - 60) * 1000;
    return this.accessToken;
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      return this.fetchToken();
    }
    return this.accessToken;
  }

  private async lotteonApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.ensureToken();
    const url = `${LOTTEON_API_BASE}${path}`;

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
    this.sellerId = credentials.sellerId as string;
    this.apiKey = credentials.apiKey as string;
    this.accountNo = credentials.accountNo as string;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      this.sellerId = credentials.sellerId as string;
      this.apiKey = credentials.apiKey as string;
      this.accountNo = credentials.accountNo as string;
      await this.fetchToken();
      return { success: true, message: '롯데온 연결 성공' };
    } catch (err) {
      return { success: false, message: `롯데온 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  /**
   * 상품 목록 조회 (apiNo=93)
   */
  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    const data = await this.lotteonApi<{ data: { items: unknown[]; totalCount: number } }>(
      'POST', '/api/v1/product/list',
      { page, pageSize: size, accountNo: this.accountNo },
    );
    return {
      items: (data.data?.items || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  /**
   * 상품 등록 (apiNo=87)
   */
  async createProduct(product: Record<string, unknown>) {
    const data = await this.lotteonApi<{ data: { productId: string } }>(
      'POST', '/api/v1/product/register',
      { ...product, accountNo: this.accountNo },
    );
    return { channelProductId: data.data?.productId || '', success: true };
  }

  /**
   * 승인 상품 수정 (apiNo=90)
   */
  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.lotteonApi('POST', '/api/v1/product/modify', {
      ...product,
      productId: channelProductId,
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  /**
   * 롯데온은 삭제 API가 없음 → 판매종료 처리 (자동삭제 정책)
   */
  async deleteProduct(channelProductId: string) {
    // 상품 판매상태 변경 (apiNo=92) → 판매종료
    await this.lotteonApi('POST', '/api/v1/product/status', {
      productId: channelProductId,
      salesStatus: 'END',
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.lotteonApi('POST', '/api/v1/product/modify', {
      productId: channelProductId,
      salePrice: price,
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  /**
   * 재고 API (apiNo=86)
   */
  async updateStock(channelProductId: string, stock: number) {
    await this.lotteonApi('POST', '/api/v1/product/inventory', {
      productId: channelProductId,
      stockQty: stock,
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  /**
   * 상품 판매상태 변경 (apiNo=92)
   */
  async suspendProduct(channelProductId: string) {
    await this.lotteonApi('POST', '/api/v1/product/status', {
      productId: channelProductId,
      salesStatus: 'PAUSE',
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.lotteonApi('POST', '/api/v1/product/status', {
      productId: channelProductId,
      salesStatus: 'SALE',
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  // ── 주문 ──

  /**
   * 출고/회수지시 조회 (apiNo=209)
   */
  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.lotteonApi<{ data: { orders: unknown[]; totalCount: number } }>(
      'POST', '/api/v1/order/shipment/list',
      {
        startDate,
        endDate,
        page,
        pageSize: 50,
        accountNo: this.accountNo,
      },
    );
    return {
      items: (data.data?.orders || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  async confirmOrder(channelOrderId: string) {
    await this.lotteonApi('POST', '/api/v1/order/confirm', {
      orderNo: channelOrderId,
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  /**
   * 배송상태 통보 (apiNo=137) — 송장 등록
   */
  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.lotteonApi('POST', '/api/v1/order/delivery/status', {
      orderNo: channelOrderId,
      deliveryCompanyCode: courierCode,
      invoiceNo: invoiceNumber,
      deliveryStatus: 'SHIPPING',
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.lotteonApi('POST', '/api/v1/claim/cancel', {
      orderNo: channelOrderId,
      cancelReason: reason,
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.lotteonApi<{ data: { items: unknown[]; totalCount: number } }>(
      'POST', '/api/v1/cs/inquiry/list',
      { page, pageSize: 50, accountNo: this.accountNo },
    );
    return {
      items: (data.data?.items || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.lotteonApi('POST', '/api/v1/cs/inquiry/answer', {
      inquiryId,
      content: answer,
      accountNo: this.accountNo,
    });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.lotteonApi<{ data: { items: unknown[] } }>(
      'POST', '/api/v1/settlement/list',
      {
        startDate: params.startDate,
        endDate: params.endDate,
        accountNo: this.accountNo,
      },
    );
    return { items: (data.data?.items || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    const data = await this.lotteonApi<{ data: { categories: { categoryId: string; categoryName: string }[] } }>(
      'POST', '/api/v1/product/category/list',
      { parentCategoryId: parentId || '', accountNo: this.accountNo },
    );
    return {
      items: (data.data?.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    const data = await this.lotteonApi<{ data: { categories: { categoryId: string; categoryName: string; fullPath: string }[] } }>(
      'POST', '/api/v1/product/category/search',
      { keyword, accountNo: this.accountNo },
    );
    return {
      items: (data.data?.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName, path: c.fullPath })),
    };
  }
}
