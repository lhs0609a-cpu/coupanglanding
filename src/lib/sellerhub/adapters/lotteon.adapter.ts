import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';

const LOTTEON_API_BASE = 'https://openapi.lotteon.com';

export class LotteonAdapter extends BaseAdapter {
  channel: Channel = 'lotteon';
  private apiKey = '';
  private apiSecret = '';

  private async lotteonApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${LOTTEON_API_BASE}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'X-Lotteon-ApiKey': this.apiKey,
        'X-Lotteon-ApiSecret': this.apiSecret,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.apiCall<T>(url, options);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.apiKey = credentials.apiKey as string;
    this.apiSecret = credentials.apiSecret as string;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      await this.lotteonApi('GET', '/v1/seller/info');
      return { success: true, message: '롯데온 연결 성공' };
    } catch (err) {
      return { success: false, message: `롯데온 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    const data = await this.lotteonApi<{ items: unknown[]; totalCount: number }>(
      'GET', `/v1/products?page=${page}&size=${size}`
    );
    return { items: (data.items || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.lotteonApi<{ productId: string }>('POST', '/v1/products', product);
    return { channelProductId: data.productId, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.lotteonApi('PUT', `/v1/products/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.lotteonApi('DELETE', `/v1/products/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.lotteonApi('PUT', `/v1/products/${channelProductId}/price`, { salePrice: price });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.lotteonApi('PUT', `/v1/products/${channelProductId}/stock`, { stockQty: stock });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.lotteonApi('PUT', `/v1/products/${channelProductId}/status`, { status: 'STOP' });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.lotteonApi('PUT', `/v1/products/${channelProductId}/status`, { status: 'ON_SALE' });
    return { success: true };
  }

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.lotteonApi<{ orders: unknown[]; totalCount: number }>(
      'GET', `/v1/orders?startDate=${startDate}&endDate=${endDate}&page=${page}&size=50`
    );
    return { items: (data.orders || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    await this.lotteonApi('PUT', `/v1/orders/${channelOrderId}/confirm`);
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.lotteonApi('PUT', `/v1/orders/${channelOrderId}/invoice`, {
      deliveryCompany: courierCode,
      invoiceNumber,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.lotteonApi('PUT', `/v1/orders/${channelOrderId}/cancel`, { cancelReason: reason });
    return { success: true };
  }

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.lotteonApi<{ items: unknown[]; totalCount: number }>(
      'GET', `/v1/inquiries?page=${page}&size=50`
    );
    return { items: (data.items || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.lotteonApi('POST', `/v1/inquiries/${inquiryId}/answer`, { content: answer });
    return { success: true };
  }

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.lotteonApi<{ items: unknown[] }>(
      'GET', `/v1/settlements?startDate=${params.startDate}&endDate=${params.endDate}`
    );
    return { items: (data.items || []) as Record<string, unknown>[] };
  }

  async getCategories(parentId?: string) {
    const path = parentId ? `/v1/categories/${parentId}/sub` : '/v1/categories';
    const data = await this.lotteonApi<{ categories: { categoryId: string; categoryName: string }[] }>('GET', path);
    return {
      items: (data.categories || []).map((c) => ({ id: c.categoryId, name: c.categoryName, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    const data = await this.lotteonApi<{ categories: { categoryId: string; categoryName: string; fullPath: string }[] }>(
      'GET', `/v1/categories/search?keyword=${encodeURIComponent(keyword)}`
    );
    return {
      items: (data.categories || []).map((c) => ({ id: c.categoryId, name: c.categoryName, path: c.fullPath })),
    };
  }
}
