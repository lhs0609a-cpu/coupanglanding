import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import crypto from 'crypto';

const COUPANG_API_BASE = 'https://api-gateway.coupang.com';

// Fly.io 프록시 URL (설정되어 있으면 프록시 경유, 없으면 직접 호출)
const COUPANG_PROXY_URL = process.env.COUPANG_PROXY_URL || '';
const COUPANG_PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || '';

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
    // 쿠팡 공식 스펙: 2자리 연도 (yyMMdd'T'HHmmss'Z')
    const now = new Date();
    const yy = String(now.getUTCFullYear()).slice(2);
    const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const HH = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

    const message = `${datetime}${method}${path}${query}`;
    const signature = crypto.createHmac('sha256', this.secretKey).update(message).digest('hex');
    const authorization = `CEA algorithm=HmacSHA256, access-key=${this.accessKey}, signed-date=${datetime}, signature=${signature}`;
    return { authorization };
  }

  /**
   * 쿠팡 API 호출 — 프록시 모드 / 직접 모드 자동 전환
   *
   * COUPANG_PROXY_URL이 설정되면:
   *   Vercel → Fly.io 프록시 (고정 IP) → 쿠팡 API
   *   HMAC 서명은 프록시에서 생성
   *
   * 설정되지 않으면:
   *   직접 쿠팡 API 호출 (로컬 개발/고정 IP 서버)
   */
  private async coupangApi<T>(method: string, path: string, query = '', body?: unknown): Promise<T> {
    if (COUPANG_PROXY_URL) {
      // ── 프록시 모드: Fly.io 경유 ──
      const proxyPath = `/proxy${path}${query ? '?' + query : ''}`;
      const url = `${COUPANG_PROXY_URL}${proxyPath}`;

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Proxy-Secret': COUPANG_PROXY_SECRET,
          'X-Coupang-Access-Key': this.accessKey,
          'X-Coupang-Secret-Key': this.secretKey,
          'X-Coupang-Vendor-Id': this.vendorId, // 쿠팡 API X-Requested-By 헤더에 필요
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      return this.apiCall<T>(url, options);
    }

    // ── 직접 모드: 쿠팡 API 직접 호출 ──
    const { authorization } = this.generateSignature(method, path, query);
    const url = `${COUPANG_API_BASE}${path}${query ? '?' + query : ''}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Requested-By': this.vendorId,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.apiCall<T>(url, options);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    const vendorId = credentials.vendorId as string;
    const accessKey = credentials.accessKey as string;
    const secretKey = credentials.secretKey as string;

    if (!vendorId || !accessKey || !secretKey) {
      throw new Error('쿠팡 API 인증 정보 누락: vendorId, accessKey, secretKey 모두 필요합니다.');
    }

    this.vendorId = vendorId;
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      // 출고지 목록 조회로 연결 테스트 (가장 안정적인 API)
      await this.coupangApi('GET', '/v2/providers/marketplace_openapi/apis/api/v1/vendor/shipping-place/outbound', 'pageNum=1&pageSize=1');
      return { success: true, message: '쿠팡 API 연결 성공' };
    } catch (err) {
      return { success: false, message: `쿠팡 API 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  async getProducts(params: { page?: number; size?: number; status?: string }) {
    const { page = 1, size = 100, status } = params;
    const path = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products';
    const queryParts = [`vendorId=${this.vendorId}`, `nextToken=${page}`, `maxPerPage=${size}`];
    if (status) queryParts.push(`status=${status}`);
    const query = queryParts.join('&');

    const data = await this.coupangApi<{ data: unknown[]; nextToken?: string }>('GET', path, query);
    return { items: (data.data || []) as Record<string, unknown>[], totalCount: (data.data || []).length };
  }

  async createProduct(product: Record<string, unknown>) {
    const path = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products';

    // notices 강제 제거 (안전장치) — 키 이름은 "items" (sellerProductItemList 아님)
    const items = (product.items || product.sellerProductItemList) as Record<string, unknown>[] | undefined;
    if (items) {
      for (const item of items) {
        if (item.notices) {
          console.error(`[createProduct] !! notices 발견 — 강제 제거: keys=${Object.keys(item).join(',')}`);
          delete item.notices;
        }
      }
    }
    // payload 전체에서 notices 키 존재 여부 확인
    const payloadStr = JSON.stringify(product).slice(0, 2000);
    const hasNoticesAnywhere = payloadStr.includes('"notices"');
    const firstItem = items?.[0] || {};
    const itemKeys = Object.keys(firstItem).join(',');
    // 삭제 후에도 남아있으면 payload 일부 출력
    if (hasNoticesAnywhere) {
      const idx = payloadStr.indexOf('"notices"');
      console.error(`[createProduct] !! 삭제 후에도 notices 존재! context: ...${payloadStr.slice(Math.max(0, idx - 50), idx + 200)}...`);
    }
    const images = (firstItem.images as unknown[]) || [];
    console.error(`[createProduct] category=${product.displayCategoryCode}, items=${items?.length || 0}, images=${images.length}, itemKeys=[${itemKeys}], noticesInPayload=${hasNoticesAnywhere}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.coupangApi<any>('POST', path, '', product);

    // 쿠팡 응답 구조: { code: "200", data: { code: "SUCCESS", data: 427011919 } }
    // 또는: { code: "ERROR", message: "...", data: null }
    const outer = raw || {};
    const code = outer.code || '';
    const innerData = outer.data;

    // 에러 응답 체크
    if (code === 'ERROR' || (!innerData && innerData !== 0)) {
      const msg = outer.message || outer.details || JSON.stringify(outer).slice(0, 500);
      throw new Error(`쿠팡 API 오류 (${code}): ${msg}`);
    }

    // 중첩 응답 처리: data가 객체면 내부 data 추출
    let productId: string;
    if (typeof innerData === 'object' && innerData !== null && 'data' in innerData) {
      if (innerData.code === 'ERROR') {
        throw new Error(`쿠팡 API 오류: ${innerData.message || JSON.stringify(innerData).slice(0, 300)}`);
      }
      productId = String(innerData.data);
    } else {
      productId = String(innerData);
    }

    return { channelProductId: productId, success: true };
  }

  /** 상품 승인 요청 (임시저장 → 승인요청) */
  async approveProduct(sellerProductId: string): Promise<{ success: boolean; message: string }> {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}/approvals`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.coupangApi<any>('PUT', path);
      return { success: true, message: data?.message || '승인 요청 완료' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '승인 요청 실패' };
    }
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
    const path = '/v2/providers/marketplace_openapi/apis/api/v1/vendor/shipping-place/outbound';
    const query = 'pageSize=50&pageNum=1';
    const data = await this.coupangApi<{
      content: {
        outboundShippingPlaceCode: number;
        shippingPlaceName: string;
        placeAddresses: { returnAddress: string; returnAddressDetail: string }[];
        usable: boolean;
      }[];
      pagination?: { totalElements: number };
    }>('GET', path, query);
    const content = data.content || [];
    return {
      items: content.map((p) => ({
        outboundShippingPlaceCode: String(p.outboundShippingPlaceCode),
        placeName: p.shippingPlaceName,
        placeAddresses: p.placeAddresses?.[0]?.returnAddress || '',
        usable: p.usable,
      })),
    };
  }

  /** 반품지 목록 조회 */
  async getReturnShippingCenters(): Promise<{
    items: { returnCenterCode: string; shippingPlaceName: string; deliverCode: string; returnAddress: string; usable: boolean }[];
  }> {
    const path = `/v2/providers/openapi/apis/api/v5/vendors/${this.vendorId}/returnShippingCenters`;
    const data = await this.coupangApi<{
      code: number;
      data: {
        content: {
          returnCenterCode: string;
          shippingPlaceName: string;
          deliverCode: string;
          placeAddresses?: { returnAddress: string }[];
          usable: boolean;
        }[];
      };
    }>('GET', path);
    const content = data.data?.content || [];
    return {
      items: content.map((c) => ({
        returnCenterCode: String(c.returnCenterCode),
        shippingPlaceName: c.shippingPlaceName,
        deliverCode: c.deliverCode || '',
        returnAddress: c.placeAddresses?.[0]?.returnAddress || '',
        usable: c.usable,
      })),
    };
  }

  /** 카테고리별 상품정보제공고시 항목 조회 */
  async getNoticeCategoryFields(categoryCode: string): Promise<{
    items: { noticeCategoryName: string; noticeCategoryDetailNames: { name: string; required: boolean }[] }[];
  }> {
    // 여러 엔드포인트 시도 (쿠팡 API 버전에 따라 다름)
    const endpoints = [
      `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-models/display-category-codes/${categoryCode}`,
      `/v2/providers/seller_api/apis/api/v1/vendor/categories/${categoryCode}/noticeCategories`,
      `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/categorization/meta/display-category-codes/${categoryCode}`,
    ];

    for (const path of endpoints) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await this.coupangApi<any>('GET', path);
        const data = raw?.data || raw;
        if (!data) continue;

        // 응답 구조 자동 감지
        const noticeCategories = data.noticeCategories || data.noticeCategoryList || (Array.isArray(data) ? data : null);
        if (noticeCategories && Array.isArray(noticeCategories) && noticeCategories.length > 0) {
          console.log(`[getNoticeCategoryFields] 성공: path=${path.split('/').pop()}, categories=${noticeCategories.length}`);
          return {
            items: noticeCategories.map((nc: Record<string, unknown>) => ({
              noticeCategoryName: (nc.noticeCategoryName as string) || '',
              noticeCategoryDetailNames: ((nc.noticeCategoryDetailNames || nc.noticeDetails || []) as Record<string, unknown>[]).map((d) => ({
                name: (d.noticeCategoryDetailName as string) || (d.name as string) || '',
                required: (d.required as boolean) ?? true,
              })),
            })),
          };
        }
      } catch {
        // 이 엔드포인트 실패 → 다음 시도
        continue;
      }
    }

    console.warn(`[getNoticeCategoryFields] 모든 엔드포인트 실패: categoryCode=${categoryCode}`);
    return { items: [] };
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
