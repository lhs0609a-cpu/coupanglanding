import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import crypto from 'crypto';

const COUPANG_API_BASE = 'https://api-gateway.coupang.com';

export class CoupangAdapter extends BaseAdapter {
  channel: Channel = 'coupang';
  private vendorId = '';
  private accessKey = '';
  private secretKey = '';

  /** vendorId 외부 접근 (페이로드 빌드에 필요) */
  getVendorId(): string {
    return this.vendorId;
  }

  private generateSignature(method: string, path: string, query: string): { authorization: string } {
    const datetime = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const message = `${datetime}${method}${path}${query}`;
    const signature = crypto.createHmac('sha256', this.secretKey).update(message).digest('hex');
    const authorization = `CEA algorithm=HmacSHA256, access-key=${this.accessKey}, signed-date=${datetime}, signature=${signature}`;
    return { authorization };
  }

  private async coupangApi<T>(method: string, path: string, query = '', body?: unknown): Promise<T> {
    const { authorization } = this.generateSignature(method, path, query);
    const url = `${COUPANG_API_BASE}${path}${query ? '?' + query : ''}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.apiCall<T>(url, options);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.vendorId = credentials.vendorId as string;
    this.accessKey = credentials.accessKey as string;
    this.secretKey = credentials.secretKey as string;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      await this.coupangApi('GET', `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}`);
      return { success: true, message: '쿠팡 API 연결 성공' };
    } catch (err) {
      return { success: false, message: `쿠팡 API 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProducts(params: { page?: number; size?: number; status?: string }) {
    const { page = 1, size = 100, status } = params;
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/products`;
    const queryParts = [`nextToken=${page}`, `maxPerPage=${size}`];
    if (status) queryParts.push(`status=${status}`);
    const query = queryParts.join('&');

    const data = await this.coupangApi<{ data: unknown[]; pagination: { totalElements: number } }>('GET', path, query);
    return { items: (data.data || []) as Record<string, unknown>[], totalCount: data.pagination?.totalElements || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/products`;
    const data = await this.coupangApi<{ data: string }>('POST', path, '', product);
    return { channelProductId: data.data, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/products/${channelProductId}`;
    await this.coupangApi('PUT', path, '', product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/products/${channelProductId}`;
    await this.coupangApi('DELETE', path);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    // Coupang uses updateProduct for price changes
    return this.updateProduct(channelProductId, { sellerProductItemList: [{ originalPrice: price, salePrice: price }] });
  }

  async updateStock(channelProductId: string, stock: number) {
    return this.updateProduct(channelProductId, { sellerProductItemList: [{ maximumBuyCount: stock }] });
  }

  async suspendProduct(channelProductId: string) {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/products/${channelProductId}/suspend`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/products/${channelProductId}/resume`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, status, page = 1 } = params;
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/ordersheets`;
    // 쿠팡 ordersheets API는 epoch milliseconds 형식 필요
    const fromMs = new Date(startDate + 'T00:00:00+09:00').getTime();
    const toMs = new Date(endDate + 'T23:59:59+09:00').getTime();
    const queryParts = [`createdAtFrom=${fromMs}`, `createdAtTo=${toMs}`, `maxPerPage=50`, `page=${page}`];
    if (status) queryParts.push(`status=${status}`);
    const query = queryParts.join('&');

    const data = await this.coupangApi<{ data: unknown[]; pagination: { totalElements: number } }>('GET', path, query);
    return { items: (data.data || []) as Record<string, unknown>[], totalCount: data.pagination?.totalElements || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/ordersheets/${channelOrderId}/confirmed`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/ordersheets/${channelOrderId}/invoices`;
    await this.coupangApi('POST', path, '', {
      vendorId: this.vendorId,
      shipmentBoxId: channelOrderId,
      deliveryCompanyCode: courierCode,
      invoiceNumber,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/ordersheets/${channelOrderId}/cancel`;
    await this.coupangApi('PATCH', path, '', { cancelReasonCode: 'ETC', cancelReason: reason });
    return { success: true };
  }

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    // Coupang doesn't have a dedicated inquiry API through Wing Open API
    return { items: [], totalCount: 0 };
  }

  async answerInquiry(_inquiryId: string, _answer: string) {
    return { success: false };
  }

  async getSettlements(params: { startDate: string; endDate: string }) {
    const { startDate, endDate } = params;
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/settlements`;
    const query = `startDate=${startDate}&endDate=${endDate}`;
    const data = await this.coupangApi<{ data: unknown[] }>('GET', path, query);
    return { items: (data.data || []) as Record<string, unknown>[] };
  }

  async getCategories(parentId?: string) {
    const path = parentId
      ? `/v2/providers/seller_api/apis/api/v1/vendor/categories/${parentId}/children`
      : '/v2/providers/seller_api/apis/api/v1/vendor/categories';
    const data = await this.coupangApi<{ data: { categoryId: string; categoryName: string }[] }>('GET', path);
    return {
      items: (data.data || []).map((c) => ({
        id: c.categoryId,
        name: c.categoryName,
        parentId,
      })),
    };
  }

  async searchCategory(keyword: string) {
    const path = '/v2/providers/seller_api/apis/api/v1/vendor/categories/search';
    const query = `keyword=${encodeURIComponent(keyword)}`;
    const data = await this.coupangApi<{ data: { categoryId: string; categoryName: string; wholeCategoryName: string }[] }>('GET', path, query);
    return {
      items: (data.data || []).map((c) => ({
        id: c.categoryId,
        name: c.categoryName,
        path: c.wholeCategoryName,
      })),
    };
  }

  // ====== 물류 정보 조회 (상품 등록 시 필수) ======

  /** 출고지 목록 조회 */
  async getOutboundShippingPlaces(): Promise<{
    items: { outboundShippingPlaceCode: string; placeName: string; placeAddresses: string; usable: boolean }[];
  }> {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/outboundShippingPlaces`;
    const data = await this.coupangApi<{
      data: {
        content: {
          outboundShippingPlaceCode: number;
          placeName: string;
          placeAddresses: { returnAddress: string }[];
          usable: boolean;
        }[];
      };
    }>('GET', path);
    const content = data.data?.content || [];
    return {
      items: content.map((p) => ({
        outboundShippingPlaceCode: String(p.outboundShippingPlaceCode),
        placeName: p.placeName,
        placeAddresses: p.placeAddresses?.[0]?.returnAddress || '',
        usable: p.usable,
      })),
    };
  }

  /** 반품지 목록 조회 */
  async getReturnShippingCenters(): Promise<{
    items: { returnCenterCode: string; shippingPlaceName: string; deliverCode: string; returnAddress: string; usable: boolean }[];
  }> {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/sellers/${this.vendorId}/returnShippingCenters`;
    const data = await this.coupangApi<{
      data: {
        content: {
          returnCenterCode: number;
          shippingPlaceName: string;
          deliverCode: string;
          returnAddress: string;
          usable: boolean;
        }[];
      };
    }>('GET', path);
    const content = data.data?.content || [];
    return {
      items: content.map((c) => ({
        returnCenterCode: String(c.returnCenterCode),
        shippingPlaceName: c.shippingPlaceName,
        deliverCode: c.deliverCode,
        returnAddress: c.returnAddress || '',
        usable: c.usable,
      })),
    };
  }

  /** 카테고리별 상품정보제공고시 항목 조회 */
  async getNoticeCategoryFields(categoryCode: string): Promise<{
    items: { noticeCategoryName: string; noticeCategoryDetailNames: { name: string; required: boolean }[] }[];
  }> {
    const path = `/v2/providers/seller_api/apis/api/v1/vendor/categories/${categoryCode}/noticeCategories`;
    const data = await this.coupangApi<{
      data: {
        noticeCategoryName: string;
        noticeCategoryDetailNames: { noticeCategoryDetailName: string; required: boolean }[];
      }[];
    }>('GET', path);
    return {
      items: (data.data || []).map((nc) => ({
        noticeCategoryName: nc.noticeCategoryName,
        noticeCategoryDetailNames: (nc.noticeCategoryDetailNames || []).map((d) => ({
          name: d.noticeCategoryDetailName,
          required: d.required,
        })),
      })),
    };
  }

  /** 카테고리 자동 매칭 (상품명 기반) — Predict API */
  async autoCategorize(productName: string): Promise<{
    predictedCategoryId: string;
    predictedCategoryName: string;
  } | null> {
    try {
      const path = '/v2/providers/openapi/apis/api/v1/categorization/predict';
      const data = await this.coupangApi<{
        code: number;
        data: {
          autoCategorizationPredictionResultType?: string;
          predictedCategoryId?: string;
          predictedCategoryName?: string;
        };
      }>('POST', path, '', { productName });
      if (
        data.data?.autoCategorizationPredictionResultType !== 'SUCCESS' ||
        !data.data?.predictedCategoryId
      ) {
        return null;
      }
      return {
        predictedCategoryId: data.data.predictedCategoryId,
        predictedCategoryName: data.data.predictedCategoryName || '',
      };
    } catch (err) {
      console.warn('[CoupangAdapter] autoCategorize failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /** 카테고리 속성(구매옵션/필수속성) 조회 */
  async getCategoryAttributes(categoryCode: string): Promise<{
    items: {
      attributeTypeName: string;
      required: boolean;
      dataType: string;
      attributeValues?: { attributeValueName: string }[];
    }[];
  }> {
    try {
      const path = `/v2/providers/seller_api/apis/api/v1/vendor/categories/${categoryCode}/attributes`;
      const data = await this.coupangApi<{
        data: {
          attributeTypeName: string;
          required: boolean;
          dataType: string;
          attributeValueList?: { attributeValueName: string }[];
        }[];
      }>('GET', path);
      return {
        items: (data.data || []).map((attr) => ({
          attributeTypeName: attr.attributeTypeName,
          required: attr.required,
          dataType: attr.dataType,
          attributeValues: attr.attributeValueList?.map((v) => ({
            attributeValueName: v.attributeValueName,
          })),
        })),
      };
    } catch {
      return { items: [] };
    }
  }
}
