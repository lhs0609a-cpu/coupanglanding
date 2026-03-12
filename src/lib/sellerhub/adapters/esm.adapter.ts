import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';

const ESM_API_BASE = 'https://api.esmplus.com';

export class EsmAdapter extends BaseAdapter {
  channel: Channel;
  private userId = '';
  private apiKey = '';
  private siteId: string;

  constructor(channel: 'gmarket' | 'auction') {
    super();
    this.channel = channel;
    this.siteId = channel === 'gmarket' ? 'GM' : 'IAC';
  }

  private async esmApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${ESM_API_BASE}${path}`;
    const auth = Buffer.from(`${this.userId}:${this.apiKey}`).toString('base64');

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'X-ESM-Site': this.siteId,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.apiCall<T>(url, options);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.userId = credentials.userId as string;
    this.apiKey = credentials.apiKey as string;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      await this.esmApi('GET', '/api/v1/seller/info');
      const label = this.channel === 'gmarket' ? 'G마켓' : '옥션';
      return { success: true, message: `${label} 연결 성공` };
    } catch (err) {
      return { success: false, message: `연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    const data = await this.esmApi<{ items: unknown[]; totalCount: number }>(
      'GET', `/api/v1/products?page=${page}&size=${size}`
    );
    return { items: (data.items || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.esmApi<{ goodsNo: string }>('POST', '/api/v1/products', product);
    return { channelProductId: data.goodsNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.esmApi('PUT', `/api/v1/products/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.esmApi('DELETE', `/api/v1/products/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.esmApi('PUT', `/api/v1/products/${channelProductId}/price`, { goodsPrice: price });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.esmApi('PUT', `/api/v1/products/${channelProductId}/stock`, { stockQty: stock });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.esmApi('PUT', `/api/v1/products/${channelProductId}/status`, { status: 'STOP' });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.esmApi('PUT', `/api/v1/products/${channelProductId}/status`, { status: 'SALE' });
    return { success: true };
  }

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.esmApi<{ orders: unknown[]; totalCount: number }>(
      'GET', `/api/v1/orders?startDate=${startDate}&endDate=${endDate}&page=${page}&size=50`
    );
    return { items: (data.orders || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    await this.esmApi('PUT', `/api/v1/orders/${channelOrderId}/confirm`);
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.esmApi('PUT', `/api/v1/orders/${channelOrderId}/invoice`, {
      deliveryCo: courierCode,
      invoiceNo: invoiceNumber,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.esmApi('PUT', `/api/v1/orders/${channelOrderId}/cancel`, { reason });
    return { success: true };
  }

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.esmApi<{ items: unknown[]; totalCount: number }>(
      'GET', `/api/v1/inquiries?page=${page}&size=50`
    );
    return { items: (data.items || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.esmApi('POST', `/api/v1/inquiries/${inquiryId}/answer`, { answer });
    return { success: true };
  }

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.esmApi<{ items: unknown[] }>(
      'GET', `/api/v1/settlements?startDate=${params.startDate}&endDate=${params.endDate}`
    );
    return { items: (data.items || []) as Record<string, unknown>[] };
  }

  async getCategories(parentId?: string) {
    const path = parentId ? `/api/v1/categories/${parentId}/children` : '/api/v1/categories';
    const data = await this.esmApi<{ categories: { catId: string; catName: string }[] }>('GET', path);
    return {
      items: (data.categories || []).map((c) => ({ id: c.catId, name: c.catName, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    const data = await this.esmApi<{ categories: { catId: string; catName: string; fullPath: string }[] }>(
      'GET', `/api/v1/categories/search?keyword=${encodeURIComponent(keyword)}`
    );
    return {
      items: (data.categories || []).map((c) => ({ id: c.catId, name: c.catName, path: c.fullPath })),
    };
  }
}
