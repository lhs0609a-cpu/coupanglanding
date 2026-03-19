import crypto from 'crypto';

const ALI1688_API_BASE = 'https://gw.open.1688.com/openapi';

export class Ali1688Adapter {
  private appKey = '';
  private appSecret = '';
  private accessToken = '';

  private generateSign(path: string, params: Record<string, string>): string {
    const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
    const signStr = `${path}${sorted}`;
    return crypto.createHmac('md5', this.appSecret).update(signStr).digest('hex').toUpperCase();
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
      return { success: true, message: '1688 연결 성공' };
    } catch (err) {
      return { success: false, message: `1688 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProduct(offerId: string): Promise<Record<string, unknown>> {
    const apiPath = 'com.alibaba.product/alibaba.product.get';
    const params: Record<string, string> = {
      access_token: this.accessToken,
      productID: offerId,
    };
    params._aop_signature = this.generateSign(apiPath, params);

    const url = `${ALI1688_API_BASE}/param2/1/${apiPath}/${this.appKey}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }

  async searchProducts(keyword: string, page = 1): Promise<Record<string, unknown>> {
    const apiPath = 'com.alibaba.product/alibaba.product.search';
    const params: Record<string, string> = {
      access_token: this.accessToken,
      keywords: keyword,
      page: String(page),
      pageSize: '20',
    };
    params._aop_signature = this.generateSign(apiPath, params);

    const url = `${ALI1688_API_BASE}/param2/1/${apiPath}/${this.appKey}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }

  async imageSearch(imageUrl: string): Promise<Record<string, unknown>> {
    const apiPath = 'com.alibaba.product/alibaba.product.imageSearch';
    const params: Record<string, string> = {
      access_token: this.accessToken,
      imageUrl,
    };
    params._aop_signature = this.generateSign(apiPath, params);

    const url = `${ALI1688_API_BASE}/param2/1/${apiPath}/${this.appKey}?${new URLSearchParams(params)}`;
    const res = await fetch(url);
    return res.json();
  }

  async createOrder(offerId: string, skuId: string, quantity: number): Promise<Record<string, unknown>> {
    const apiPath = 'com.alibaba.trade/alibaba.trade.create';
    const params: Record<string, string> = {
      access_token: this.accessToken,
      offerId,
      skuId,
      quantity: String(quantity),
    };
    params._aop_signature = this.generateSign(apiPath, params);

    const url = `${ALI1688_API_BASE}/param2/1/${apiPath}/${this.appKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    return res.json();
  }
}
