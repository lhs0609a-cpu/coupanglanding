/**
 * ESM Trading API 어댑터 (G마켓 / 옥션)
 *
 * 공식 문서: https://etapi.gmarket.com
 * (구 etapi.ebaykorea.com → 2022.12.01 gmarket 도메인으로 이전)
 *
 * 인증: JWT (HS256 HMAC) — kid=마스터ID, ssi=A:{옥션ID},G:{지마켓ID}
 * Base URL: https://sa2.esmplus.com
 *
 * 주의:
 * - SiteType 값: 옥션=1, G마켓=2 (취소조회만 G마켓=3)
 * - 정산 API에서는 옥션="A", G마켓="G" (문자열)
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import crypto from 'crypto';

const ESM_API_BASE = 'https://sa2.esmplus.com';

export class EsmAdapter extends BaseAdapter {
  channel: Channel;
  private masterId = '';    // ESM+ 마스터ID (JWT kid)
  private secretKey = '';   // HMAC Secret Key (이메일 신청으로 발급)
  private sellerId = '';    // 사이트별 셀러ID (G마켓 또는 옥션)
  private siteType: number; // 1=옥션, 2=G마켓

  constructor(channel: 'gmarket' | 'auction') {
    super();
    this.channel = channel;
    this.siteType = channel === 'gmarket' ? 2 : 1;
  }

  /**
   * JWT 토큰 생성 (HS256)
   * Header: { "alg": "HS256", "typ": "JWT", "kid": "{masterId}" }
   * Payload: { "iss": "{domain}", "sub": "sell", "aud": "sa.esmplus.com", "iat": timestamp, "ssi": "A:{auctionId},G:{gmarketId}" }
   */
  private generateJwt(): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
      kid: this.masterId,
    };

    const sitePrefix = this.channel === 'gmarket' ? 'G' : 'A';
    const payload = {
      iss: 'sellerhub.app',
      sub: 'sell',
      aud: 'sa.esmplus.com',
      iat: Math.floor(Date.now() / 1000),
      ssi: `${sitePrefix}:${this.sellerId}`,
    };

    const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${encHeader}.${encPayload}`)
      .digest('base64url');

    return `${encHeader}.${encPayload}.${signature}`;
  }

  private async esmApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.generateJwt();
    const url = `${ESM_API_BASE}${path}`;

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
    this.masterId = credentials.masterId as string || credentials.userId as string;
    this.secretKey = credentials.secretKey as string || credentials.apiKey as string;
    this.sellerId = credentials.sellerId as string || this.masterId;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      // 상품 검색으로 연결 테스트 (1개만)
      await this.esmApi('POST', '/item/v1/goods/search', { pageNo: 1, pageSize: 1 });
      const label = this.channel === 'gmarket' ? 'G마켓' : '옥션';
      return { success: true, message: `${label} 연결 성공` };
    } catch (err) {
      return { success: false, message: `연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    // POST /item/v1/goods/search (30회/분, 최대 500건)
    const data = await this.esmApi<{ data: { items: unknown[]; totalCount: number } }>(
      'POST', '/item/v1/goods/search',
      { pageNo: page, pageSize: Math.min(size, 500), siteType: this.siteType },
    );
    return {
      items: (data.data?.items || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.esmApi<{ data: { goodsNo: string } }>(
      'POST', '/item/v1/goods', product,
    );
    return { channelProductId: data.data?.goodsNo || '', success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.esmApi('DELETE', `/item/v1/goods/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    // sell-status API로 가격/재고/상태 수정
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      goodsPrice: price,
    });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      stockQty: stock,
    });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      sellStatus: 'STOP',
    });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      sellStatus: 'SALE',
    });
    return { success: true };
  }

  // ── 주문 ──

  /**
   * 결제완료 주문 조회: POST /shipping/v1/Order/RequestOrders (5초당 1회)
   */
  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate } = params;
    const data = await this.esmApi<{ data: { orders: unknown[]; totalCount: number } }>(
      'POST', '/shipping/v1/Order/RequestOrders',
      {
        siteType: this.siteType,
        startDate: startDate.replace(/-/g, ''),
        endDate: endDate.replace(/-/g, ''),
      },
    );
    return {
      items: (data.data?.orders || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  /**
   * 주문 확인: POST /shipping/v1/Order/OrderCheck/{OrderNo}
   */
  async confirmOrder(channelOrderId: string) {
    await this.esmApi('POST', `/shipping/v1/Order/OrderCheck/${channelOrderId}`, {
      siteType: this.siteType,
    });
    return { success: true };
  }

  /**
   * 송장 등록: POST /shipping/v1/Delivery/ShippingInfo
   */
  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.esmApi('POST', '/shipping/v1/Delivery/ShippingInfo', {
      siteType: this.siteType,
      orderNo: channelOrderId,
      deliveryCompanyCode: courierCode,
      invoiceNo: invoiceNumber,
    });
    return { success: true };
  }

  /**
   * 판매자 취소: POST /claim/v1/sa/Cancel/{OrderNo}/SoldOut
   */
  async cancelOrder(channelOrderId: string, reason: string) {
    // 취소조회: G마켓 siteType=3 (예외)
    const cancelSiteType = this.channel === 'gmarket' ? 3 : 1;
    await this.esmApi('POST', `/claim/v1/sa/Cancel/${channelOrderId}/SoldOut`, {
      siteType: cancelSiteType,
      cancelReason: reason,
    });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    // CS API: POST /item/v1/communications/customer/bulletin-board/qna
    const data = await this.esmApi<{ data: { items: unknown[]; totalCount: number } }>(
      'POST', '/item/v1/communications/customer/bulletin-board/qna',
      { siteType: this.siteType, pageNo: params.page || 1, pageSize: 50 },
    );
    return {
      items: (data.data?.items || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.esmApi('POST', '/item/v1/communications/customer/bulletin-board/qna', {
      siteType: this.siteType,
      inquiryNo: inquiryId,
      answer,
    });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    // 정산에서는 옥션="A", G마켓="G" (문자열)
    const settleSiteType = this.channel === 'gmarket' ? 'G' : 'A';
    const data = await this.esmApi<{ data: { items: unknown[] } }>(
      'POST', '/account/v1/settle/getsettleorder',
      {
        siteType: settleSiteType,
        startDate: params.startDate.replace(/-/g, ''),
        endDate: params.endDate.replace(/-/g, ''),
      },
    );
    return { items: (data.data?.items || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    if (parentId) {
      // 사이트 서브카테고리: GET /item/v1/categories/site-cats/{siteCatCode}
      const data = await this.esmApi<{ data: { id: string; name: string }[] }>(
        'GET', `/item/v1/categories/site-cats/${parentId}`,
      );
      return {
        items: (data.data || []).map(c => ({ id: c.id, name: c.name, parentId })),
      };
    }

    // 사이트 최상위 카테고리: GET /item/v1/categories/site-cats
    const data = await this.esmApi<{ data: { id: string; name: string }[] }>(
      'GET', '/item/v1/categories/site-cats',
    );
    return {
      items: (data.data || []).map(c => ({ id: c.id, name: c.name })),
    };
  }

  async searchCategory(keyword: string) {
    // ESM은 카테고리 검색 API가 없으므로 전체 조회 후 클라이언트 필터링
    const data = await this.esmApi<{ data: { id: string; name: string; fullPath?: string }[] }>(
      'GET', '/item/v1/categories/site-cats',
    );
    const matched = (data.data || []).filter(c => c.name?.includes(keyword));
    return {
      items: matched.slice(0, 20).map(c => ({ id: c.id, name: c.name, path: c.fullPath || c.name })),
    };
  }
}
