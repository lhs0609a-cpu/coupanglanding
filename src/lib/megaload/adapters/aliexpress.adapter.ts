import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import crypto from 'crypto';

const ALI_API_BASE = 'https://api-sg.aliexpress.com/sync';

export class AliexpressAdapter {
  private appKey = '';
  private appSecret = '';
  private accessToken = '';

  private generateSign(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
    const signStr = `${this.appSecret}${sorted}${this.appSecret}`;
    return crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.appKey = credentials.appKey as string;
    this.appSecret = credentials.appSecret as string;
    this.accessToken = credentials.accessToken as string || '';
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      return { success: true, message: 'AliExpress 연결 성공' };
    } catch (err) {
      return { success: false, message: `AliExpress 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProduct(productId: string): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      method: 'aliexpress.ds.product.get',
      app_key: this.appKey,
      access_token: this.accessToken,
      product_id: productId,
      timestamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      sign_method: 'md5',
      format: 'json',
      v: '2.0',
    };
    params.sign = this.generateSign(params);

    const url = `${ALI_API_BASE}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }

  async searchProducts(keyword: string, page = 1): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      method: 'aliexpress.ds.recommend.feed.get',
      app_key: this.appKey,
      access_token: this.accessToken,
      feed_name: keyword,
      page_no: String(page),
      page_size: '50',
      timestamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      sign_method: 'md5',
      format: 'json',
      v: '2.0',
    };
    params.sign = this.generateSign(params);

    const url = `${ALI_API_BASE}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }

  async createOrder(productId: string, skuId: string, quantity: number, shippingAddress: Record<string, string>): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      method: 'aliexpress.ds.order.create',
      app_key: this.appKey,
      access_token: this.accessToken,
      product_id: productId,
      sku_id: skuId,
      quantity: String(quantity),
      logistics_address: JSON.stringify(shippingAddress),
      timestamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      sign_method: 'md5',
      format: 'json',
      v: '2.0',
    };
    params.sign = this.generateSign(params);

    const url = `${ALI_API_BASE}?${new URLSearchParams(params)}`;
    const res = await fetch(url, { method: 'POST' });
    return res.json();
  }

  async getOrderTracking(orderId: string): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      method: 'aliexpress.ds.tracking.get',
      app_key: this.appKey,
      access_token: this.accessToken,
      order_id: orderId,
      timestamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      sign_method: 'md5',
      format: 'json',
      v: '2.0',
    };
    params.sign = this.generateSign(params);

    const url = `${ALI_API_BASE}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }
}
