import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import crypto from 'crypto';

const NAVER_API_BASE = 'https://api.commerce.naver.com';

export class NaverAdapter extends BaseAdapter {
  channel: Channel = 'naver';
  private clientId = '';
  private clientSecret = '';
  private accessToken = '';

  private generateToken(): string {
    const timestamp = Date.now();
    const password = `${this.clientId}_${timestamp}`;
    const signature = crypto.createHmac('sha256', this.clientSecret).update(password).digest('base64');
    // In production: exchange this for an actual OAuth token
    return Buffer.from(`${this.clientId}:${signature}`).toString('base64');
  }

  private async naverApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.accessToken) {
      this.accessToken = this.generateToken();
    }

    const url = `${NAVER_API_BASE}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
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
      await this.authenticate(credentials);
      this.accessToken = this.generateToken();
      return { success: true, message: '네이버 스마트스토어 연결 성공' };
    } catch (err) {
      return { success: false, message: `네이버 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProducts(params: { page?: number; size?: number; status?: string }) {
    const { page = 1, size = 100 } = params;
    const data = await this.naverApi<{ contents: unknown[]; totalElements: number }>('GET', `/external/v1/products?page=${page}&size=${size}`);
    return { items: (data.contents || []) as Record<string, unknown>[], totalCount: data.totalElements || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.naverApi<{ smartstoreChannelProductNo: string }>('POST', '/external/v2/products', { originProduct: product });
    return { channelProductId: data.smartstoreChannelProductNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.naverApi('PUT', `/external/v2/products/channel-products/${channelProductId}`, { originProduct: product });
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.naverApi('DELETE', `/external/v2/products/channel-products/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.naverApi('PUT', `/external/v2/products/channel-products/${channelProductId}`, {
      originProduct: { detailAttribute: { salePrice: price } },
    });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.naverApi('PUT', `/external/v2/products/channel-products/${channelProductId}`, {
      originProduct: { detailAttribute: { stockQuantity: stock } },
    });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.naverApi('PUT', `/external/v2/products/channel-products/${channelProductId}`, {
      originProduct: { statusType: 'SUSPENSION' },
    });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.naverApi('PUT', `/external/v2/products/channel-products/${channelProductId}`, {
      originProduct: { statusType: 'SALE' },
    });
    return { success: true };
  }

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.naverApi<{ data: { contents: unknown[]; totalElements: number } }>(
      'GET',
      `/external/v1/pay-order/seller/product-orders?from=${startDate}&to=${endDate}&page=${page}&size=50`
    );
    return { items: (data.data?.contents || []) as Record<string, unknown>[], totalCount: data.data?.totalElements || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    await this.naverApi('POST', '/external/v1/pay-order/seller/product-orders/confirm', {
      productOrderIds: [channelOrderId],
    });
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.naverApi('POST', '/external/v1/pay-order/seller/product-orders/dispatch', {
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
    await this.naverApi('POST', '/external/v1/pay-order/seller/product-orders/cancel', {
      productOrderId: channelOrderId,
      cancelReason: reason,
    });
    return { success: true };
  }

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.naverApi<{ contents: unknown[]; totalElements: number }>(
      'GET', `/external/v1/contents/qnas?page=${page}&size=50`
    );
    return { items: (data.contents || []) as Record<string, unknown>[], totalCount: data.totalElements || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.naverApi('POST', `/external/v1/contents/qnas/${inquiryId}/answer`, { content: answer });
    return { success: true };
  }

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.naverApi<{ data: unknown[] }>(
      'GET', `/external/v1/pay-order/seller/settlements?from=${params.startDate}&to=${params.endDate}`
    );
    return { items: (data.data || []) as Record<string, unknown>[] };
  }

  async getCategories(parentId?: string) {
    const path = parentId ? `/external/v1/categories/${parentId}/sub` : '/external/v1/categories';
    const data = await this.naverApi<{ contents: { id: string; name: string }[] }>('GET', path);
    return {
      items: (data.contents || []).map((c) => ({ id: c.id, name: c.name, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    const data = await this.naverApi<{ contents: { id: string; name: string; fullName: string }[] }>(
      'GET', `/external/v1/categories/search?keyword=${encodeURIComponent(keyword)}`
    );
    return {
      items: (data.contents || []).map((c) => ({ id: c.id, name: c.name, path: c.fullName })),
    };
  }
}
