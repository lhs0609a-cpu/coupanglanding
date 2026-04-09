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

    const items = (product.items || product.sellerProductItemList) as Record<string, unknown>[] | undefined;
    const firstItem = items?.[0] || {};
    const notices = (firstItem as Record<string,unknown>).notices as unknown[];
    const images = (firstItem.images as unknown[]) || [];
    // 상세 notices 로깅 — oneOf 디버깅용
    const noticeCount = Array.isArray(notices) ? notices.length : 'none';
    const noticeSample = Array.isArray(notices) && notices.length > 0
      ? (notices as Record<string, string>[]).map(n => `${n.noticeCategoryName}::"${n.noticeCategoryDetailName}"`).join(' | ')
      : 'EMPTY';
    // attributes 로깅 — 구매옵션 디버깅용
    const attrs = (firstItem as Record<string,unknown>).attributes as { attributeTypeName: string; attributeValueName: string }[] | undefined;
    const attrSummary = Array.isArray(attrs) && attrs.length > 0
      ? attrs.map(a => `${a.attributeTypeName}="${a.attributeValueName}"`).join(' | ')
      : 'NONE';
    console.log(`[createProduct][v9] category=${product.displayCategoryCode}, items=${items?.length || 0}, images=${images.length}, notices=${noticeCount}, attrs=${attrs?.length || 0}=[${attrSummary}], fields=[${noticeSample}]`);

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
      const itms = (product as Record<string, unknown>).items as Record<string, unknown>[] | undefined;

      // 구매옵션 에러일 때 attributes 상태를 포함 (디버깅 핵심)
      const isBuyOptionErr = /구매\s*옵션|option.*value|option.*unit/i.test(msg);
      const buyOptionInfo = isBuyOptionErr
        ? (() => {
            const firstAttrs = itms?.[0]?.attributes as { attributeTypeName: string; attributeValueName: string }[] | undefined;
            const attrStr = firstAttrs
              ? firstAttrs.map(a => `${a.attributeTypeName}="${a.attributeValueName}"`).join(', ')
              : 'NONE';
            return ` [attrs=${attrStr}|category=${(product as Record<string, unknown>).displayCategoryCode}]`;
          })()
        : '';

      // 고시정보 에러일 때 payload의 notices 상태를 포함
      const isNotice = /고시정보|notices|subschema/i.test(msg);
      const noticesInfo = isNotice
        ? (() => {
            const firstNotices = itms?.[0]?.notices;
            const noticeStr = firstNotices !== undefined ? JSON.stringify(firstNotices).slice(0, 200) : 'KEY_ABSENT';
            return ` [v7|notices=${noticeStr}|category=${(product as Record<string, unknown>).displayCategoryCode}]`;
          })()
        : '';
      throw new Error(`쿠팡 API 오류 (${code}): ${msg}${buyOptionInfo}${noticesInfo}`);
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
    // 공식 스펙: PUT /v2/providers/seller_api/apis/api/v1/marketplace/seller-products/{sellerProductId}
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${channelProductId}`;
    await this.coupangApi('PUT', path, '', product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    // 공식 스펙: DELETE /v2/providers/seller_api/apis/api/v1/marketplace/seller-products/{sellerProductId}
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${channelProductId}`;
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
    // 공식 스펙: 상품 판매중지 — marketplace/seller-products 경로
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${channelProductId}/suspend`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    // 공식 스펙: 상품 판매재개 — marketplace/seller-products 경로
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${channelProductId}/resume`;
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

  /** 반품 요청 목록 조회 — v6 */
  async getReturnRequests(params: {
    createdAtFrom: string;  // "yyyy-MM-dd" or "yyyy-MM-ddTHH:mm"
    createdAtTo: string;
    status?: 'RU' | 'UC' | 'CC' | 'PR';
    timeFrame?: boolean;    // true면 searchType=timeFrame
    nextToken?: string;
    maxPerPage?: number;
  }): Promise<{ items: Record<string, unknown>[]; nextToken: string }> {
    const path = `/v2/providers/openapi/apis/api/v6/vendors/${this.vendorId}/returnRequests`;
    const parts: string[] = [];
    if (params.timeFrame) parts.push('searchType=timeFrame');
    parts.push(`createdAtFrom=${params.createdAtFrom}`);
    parts.push(`createdAtTo=${params.createdAtTo}`);
    if (params.status) parts.push(`status=${params.status}`);
    if (!params.timeFrame) {
      parts.push(`maxPerPage=${params.maxPerPage || 50}`);
      if (params.nextToken) parts.push(`nextToken=${params.nextToken}`);
    }
    const query = parts.join('&');

    const data = await this.coupangApi<{
      data: Record<string, unknown>[];
      nextToken?: string;
    }>('GET', path, query);

    return {
      items: data.data || [],
      nextToken: data.nextToken || '',
    };
  }

  /** 회수 송장 등록 */
  async registerReturnInvoice(params: {
    receiptId: number;
    deliveryCompanyCode: string;  // 'CJGLS' / 'EPOST' / 'HANJIN' / 'KDEXP' 등
    invoiceNumber: string;
    regNumber?: string;
  }): Promise<{ deliveryCompanyCode: string; invoiceNumber: string; invoiceNumberId: number; receiptId: number }> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/return-exchange-invoices/manual`;
    const body = {
      returnExchangeDeliveryType: 'RETURN',
      receiptId: params.receiptId,
      deliveryCompanyCode: params.deliveryCompanyCode,
      invoiceNumber: params.invoiceNumber,
      ...(params.regNumber && { regNumber: params.regNumber }),
    };

    const data = await this.coupangApi<{ data: Record<string, unknown> }>('POST', path, '', body);
    return data.data as { deliveryCompanyCode: string; invoiceNumber: string; invoiceNumberId: number; receiptId: number };
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
      // 공식 문서: category-related-metas (NOT models)
      `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${categoryCode}`,
      `/v2/providers/seller_api/apis/api/v1/vendor/categories/${categoryCode}/noticeCategories`,
      `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/categorization/meta/display-category-codes/${categoryCode}`,
    ];

    for (const path of endpoints) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await this.coupangApi<any>('GET', path);
        const data = raw?.data || raw;
        if (!data) {
          console.log(`[getNoticeCategoryFields] ${path.split('/').slice(-2).join('/')}: data=null`);
          continue;
        }

        // 응답 구조 자동 감지
        const noticeCategories = data.noticeCategories || data.noticeCategoryList || (Array.isArray(data) ? data : null);
        if (noticeCategories && Array.isArray(noticeCategories) && noticeCategories.length > 0) {
          console.log(`[getNoticeCategoryFields] 성공: path=${path.split('/').slice(-2).join('/')}, categories=${noticeCategories.length}, first="${noticeCategories[0]?.noticeCategoryName}"`);
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
        console.log(`[getNoticeCategoryFields] ${path.split('/').slice(-2).join('/')}: noticeCategories 없음 (keys=${Object.keys(data).join(',')})`);
      } catch (e) {
        console.log(`[getNoticeCategoryFields] ${path.split('/').slice(-2).join('/')}: 에러=${e instanceof Error ? e.message.slice(0, 100) : 'unknown'}`);
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

  /** 카테고리 속성(구매옵션/필수속성) 조회
   *
   * 올바른 endpoint: category-related-metas (notices, attributes 등 모두 반환)
   * ⚠️ 이전 버그: /vendor/categories/{code}/attributes 는 존재하지 않는 endpoint
   *    → 항상 404 → catch에서 빈 배열 반환 → 구매옵션 미전송 → 노출제한
   */
  async getCategoryAttributes(categoryCode: string): Promise<{
    items: {
      attributeTypeName: string;
      required: boolean;
      dataType: string;
      basicUnit?: string;
      usableUnits?: string[];
      exposed?: string;
      groupNumber?: string;
      attributeValues?: { attributeValueName: string }[];
    }[];
  }> {
    // 여러 엔드포인트 시도 (getNoticeCategoryFields와 동일한 전략)
    const endpoints = [
      `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${categoryCode}`,
      `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/categorization/meta/display-category-codes/${categoryCode}`,
    ];

    for (const path of endpoints) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await this.coupangApi<any>('GET', path);
        const data = raw?.data || raw;
        if (!data) continue;

        const attributes = data.attributes;
        if (attributes && Array.isArray(attributes) && attributes.length > 0) {
          console.log(`[getCategoryAttributes] 성공: category=${categoryCode}, attributes=${attributes.length}개`);
          return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items: attributes.map((attr: any) => ({
              attributeTypeName: attr.attributeTypeName || '',
              // API: "MANDATORY" | "OPTIONAL" → boolean
              required: attr.required === 'MANDATORY' || attr.required === true,
              dataType: attr.dataType || 'STRING',
              basicUnit: attr.basicUnit,
              usableUnits: attr.usableUnits,
              exposed: attr.exposed,      // "EXPOSED" = 구매옵션, "NONE" = 검색속성
              groupNumber: attr.groupNumber, // 택1 그룹 번호 ("1", "2", "NONE")
              // inputValues → attributeValues (ENUM형 선택지)
              attributeValues: (attr.inputValues || attr.attributeValueList || [])
                .map((v: { inputValue?: string; attributeValueName?: string }) => ({
                  attributeValueName: v.inputValue || v.attributeValueName || '',
                }))
                .filter((v: { attributeValueName: string }) => v.attributeValueName),
            })),
          };
        }
      } catch (e) {
        console.log(`[getCategoryAttributes] ${path.split('/').slice(-2).join('/')}: 에러=${e instanceof Error ? e.message.slice(0, 100) : 'unknown'}`);
        continue;
      }
    }

    console.warn(`[getCategoryAttributes] 모든 엔드포인트 실패: categoryCode=${categoryCode}`);
    return { items: [] };
  }
}
