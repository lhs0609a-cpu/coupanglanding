import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';

const ELEVENST_API_BASE = 'https://api.11st.co.kr';

export class ElevenstAdapter extends BaseAdapter {
  channel: Channel = 'elevenst';
  private apiKey = '';

  private async elevenstApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${ELEVENST_API_BASE}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        openapikey: this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.apiCall<T>(url, options);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.apiKey = credentials.apiKey as string;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      await this.elevenstApi('GET', '/rest/sellerApi/v2/product/search?page=1&pageSize=1');
      return { success: true, message: '11번가 연결 성공' };
    } catch (err) {
      return { success: false, message: `11번가 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    const data = await this.elevenstApi<{ products: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/v2/product/search?page=${page}&pageSize=${size}`
    );
    return { items: (data.products || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.elevenstApi<{ productNo: string }>('POST', '/rest/sellerApi/v2/product', product);
    return { channelProductId: data.productNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/product/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.elevenstApi('DELETE', `/rest/sellerApi/v2/product/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/product/${channelProductId}/price`, { selPrice: price });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/product/${channelProductId}/stock`, { stockQty: stock });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/product/${channelProductId}/status`, { selStatCd: 'STOP' });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/product/${channelProductId}/status`, { selStatCd: 'ON' });
    return { success: true };
  }

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.elevenstApi<{ orders: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/v2/order/search?startDate=${startDate}&endDate=${endDate}&page=${page}&pageSize=50`
    );
    return { items: (data.orders || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/order/${channelOrderId}/confirm`);
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/order/${channelOrderId}/invoice`, {
      deliveryCompanyCode: courierCode,
      invoiceNo: invoiceNumber,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/v2/order/${channelOrderId}/cancel`, { cancelReason: reason });
    return { success: true };
  }

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.elevenstApi<{ inquiries: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/v2/qna?page=${page}&pageSize=50`
    );
    return { items: (data.inquiries || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.elevenstApi('POST', `/rest/sellerApi/v2/qna/${inquiryId}/answer`, { answer });
    return { success: true };
  }

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.elevenstApi<{ settlements: unknown[] }>(
      'GET', `/rest/sellerApi/v2/settlement?startDate=${params.startDate}&endDate=${params.endDate}`
    );
    return { items: (data.settlements || []) as Record<string, unknown>[] };
  }

  async getCategories(parentId?: string) {
    const path = parentId ? `/rest/sellerApi/v2/category/${parentId}/sub` : '/rest/sellerApi/v2/category';
    const data = await this.elevenstApi<{ categories: { categoryId: string; categoryName: string }[] }>('GET', path);
    return {
      items: (data.categories || []).map((c) => ({ id: c.categoryId, name: c.categoryName, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    const data = await this.elevenstApi<{ categories: { categoryId: string; categoryName: string; fullPath: string }[] }>(
      'GET', `/rest/sellerApi/v2/category/search?keyword=${encodeURIComponent(keyword)}`
    );
    return {
      items: (data.categories || []).map((c) => ({ id: c.categoryId, name: c.categoryName, path: c.fullPath })),
    };
  }
}
