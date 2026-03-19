/**
 * 11번가 셀러 오픈 API 어댑터
 *
 * 공식 문서: https://openapi.11st.co.kr (로그인 필요)
 * SK Open API: https://skopenapi.readme.io (카테고리 API)
 *
 * 인증: openapikey 헤더 (API 센터에서 발급)
 * IP 화이트리스트 필수
 *
 * 중요:
 * - 11번가 셀러 API는 XML 형식이 기본 (일부 JSON 지원)
 * - 정확한 셀러 API 엔드포인트는 판매자 계정으로 로그인 후 확인 필요
 * - 아래 엔드포인트는 공개 문서 + SK Open API 기반으로 작성
 * - 실제 연동 시 셀러 로그인 후 개발가이드에서 정확한 스펙 확인 필요
 *
 * API 그룹:
 * - 상품 API: 카테고리조회, 상품조회, 상품관리, 재고처리, Q&A, 판매중지, 배송
 * - 주문 API: 주문 조회/확인/발송
 * - 반품/교환/환불 API
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';

// 11번가 셀러 API Base URL (판매자 로그인 후 확인 필요)
const ELEVENST_SELLER_API_BASE = 'https://openapi.11st.co.kr/openapi';
// SK Open API (카테고리 등 공개 API)
const SK_OPENAPI_BASE = 'https://apis.openapi.sk.com/11st';

export class ElevenstAdapter extends BaseAdapter {
  channel: Channel = 'elevenst';
  private apiKey = '';       // 셀러 API Key (openapikey)
  private skAppKey = '';     // SK Open API Key (선택, 카테고리용)

  /**
   * 11번가 셀러 API 호출
   * - 셀러 API는 XML 기반이 많으나, 일부 JSON 지원
   * - Content-Type/Accept에 따라 응답 형식 결정
   */
  private async elevenstApi<T>(method: string, path: string, body?: unknown, options?: { xml?: boolean; apiCode?: string }): Promise<T> {
    const isXml = options?.xml ?? false;

    let url: string;
    if (options?.apiCode) {
      // 레거시 API: OpenApiService.tmall?key={key}&apiCode={code}&...
      url = `${ELEVENST_SELLER_API_BASE}/OpenApiService.tmall?key=${this.apiKey}&apiCode=${options.apiCode}`;
      if (typeof body === 'string') url += body; // query params
    } else {
      url = `${ELEVENST_SELLER_API_BASE}${path}`;
    }

    const headers: Record<string, string> = {
      openapikey: this.apiKey,
    };

    if (isXml) {
      headers['Content-Type'] = 'application/xml';
      headers['Accept'] = 'application/xml';
    } else {
      headers['Content-Type'] = 'application/json';
      headers['Accept'] = 'application/json';
    }

    const fetchOptions: RequestInit = { method, headers };

    if (body && !options?.apiCode) {
      fetchOptions.body = isXml ? body as string : JSON.stringify(body);
    }

    return this.apiCall<T>(url, fetchOptions);
  }

  /**
   * SK Open API 호출 (카테고리 등 공개 API)
   */
  private async skApi<T>(path: string): Promise<T> {
    const url = `${SK_OPENAPI_BASE}${path}`;
    return this.apiCall<T>(url, {
      method: 'GET',
      headers: {
        appKey: this.skAppKey || this.apiKey,
        Accept: 'application/json',
      },
    });
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.apiKey = credentials.apiKey as string;
    this.skAppKey = (credentials.skAppKey as string) || '';
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      // 카테고리 API로 연결 테스트 (가장 안전한 읽기 전용)
      if (this.skAppKey) {
        await this.skApi('/category');
      }
      return { success: true, message: '11번가 연결 성공' };
    } catch (err) {
      return { success: false, message: `11번가 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    // 셀러 API 상품 검색 (정확한 경로는 셀러 로그인 후 확인 필요)
    const data = await this.elevenstApi<{ products: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/product/search?page=${page}&pageSize=${size}`,
    );
    return { items: (data.products || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    // 상품 등록 (일 500건 제한, 최대 10,000건)
    const data = await this.elevenstApi<{ productNo: string }>('POST', '/rest/sellerApi/product', product);
    return { channelProductId: data.productNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    // 11번가는 삭제보다 판매중지 처리가 일반적
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/status`, { selStatCd: 'STOP' });
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/price`, { selPrice: price });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    // 재고처리 API
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/stock`, { stockQty: stock });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    // 판매중지 API
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/status`, { selStatCd: 'STOP' });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/status`, { selStatCd: 'ON' });
    return { success: true };
  }

  // ── 주문 ──

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.elevenstApi<{ orders: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/order/search?startDate=${startDate}&endDate=${endDate}&page=${page}&pageSize=50`,
    );
    return { items: (data.orders || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/order/${channelOrderId}/confirm`);
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/order/${channelOrderId}/invoice`, {
      deliveryCompanyCode: courierCode,
      invoiceNo: invoiceNumber,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/order/${channelOrderId}/cancel`, { cancelReason: reason });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    // 상품 Q&A API
    const data = await this.elevenstApi<{ inquiries: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/qna?page=${page}&pageSize=50`,
    );
    return { items: (data.inquiries || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.elevenstApi('POST', `/rest/sellerApi/qna/${inquiryId}/answer`, { answer });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.elevenstApi<{ settlements: unknown[] }>(
      'GET', `/rest/sellerApi/settlement?startDate=${params.startDate}&endDate=${params.endDate}`,
    );
    return { items: (data.settlements || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    if (this.skAppKey) {
      // SK Open API로 전체 카테고리 조회 (JSON)
      const data = await this.skApi<{ Category: { depth: number; dispNm: string; dispNo: string; parentDispNo: string }[] }>('/category');
      const cats = data.Category || [];
      const filtered = parentId
        ? cats.filter(c => c.parentDispNo === parentId)
        : cats.filter(c => c.depth === 1);
      return {
        items: filtered.map(c => ({ id: c.dispNo, name: c.dispNm, parentId: c.parentDispNo || undefined })),
      };
    }

    // 레거시 XML API: apiCode=CategoryInfo
    const data = await this.elevenstApi<{ categories: { categoryId: string; categoryName: string }[] }>(
      'GET', '', `&categoryCode=${parentId || ''}`, { apiCode: 'CategoryInfo' },
    );
    return {
      items: (data.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    if (this.skAppKey) {
      // SK Open API 전체 카테고리에서 필터링
      const data = await this.skApi<{ Category: { depth: number; dispNm: string; dispNo: string }[] }>('/category');
      const matched = (data.Category || []).filter(c => c.dispNm?.includes(keyword));
      return {
        items: matched.slice(0, 20).map(c => ({ id: c.dispNo, name: c.dispNm, path: c.dispNm })),
      };
    }

    // 레거시: apiCode=ProductSearch로 카테고리 검색
    const data = await this.elevenstApi<{ categories: { categoryId: string; categoryName: string; fullPath: string }[] }>(
      'GET', '', `&keyword=${encodeURIComponent(keyword)}`, { apiCode: 'ProductSearch' },
    );
    return {
      items: (data.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName, path: c.fullPath })),
    };
  }
}
