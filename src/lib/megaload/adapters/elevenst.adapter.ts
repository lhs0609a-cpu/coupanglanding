/**
 * 11번가 셀러 오픈 API 어댑터
 *
 * 공식 문서: https://openapi.11st.co.kr (로그인 필요)
 * SK Open API: https://skopenapi.readme.io (카테고리 API)
 *
 * 인증: openapikey 헤더 (API 센터에서 발급)
 * IP 화이트리스트 필수
 *
 * 중요:
 * - 11번가 셀러 API는 XML 형식이 기본 (일부 JSON 지원)
 * - 정확한 셀러 API 엔드포인트는 판매자 계정으로 로그인 후 확인 필요
 * - 아래 엔드포인트는 공개 문서 + SK Open API 기반으로 작성
 * - 실제 연동 시 셀러 로그인 후 개발가이드에서 정확한 스펙 확인 필요
 *
 * API 그룹:
 * - 상품 API: 카테고리조회, 상품조회, 상품관리, 재고처리, Q&A, 판매중지, 배송
 * - 주문 API: 주문 조회/확인/발송
 * - 반품/교환/환불 API
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import type {
  CanonicalProduct, ChannelCapabilities, ChannelMappingContext, ChannelMappingResult,
} from '../services/canonical-product';
import { pickImages, composeDetail, cleanName } from './mapping-helpers';
import { channelFetch, isChannelProxyConfigured, xmlTag } from './channel-proxy';

// 11번가 셀러 API Base URL (판매자 로그인 후 확인 필요)
const ELEVENST_SELLER_API_BASE = 'https://openapi.11st.co.kr/openapi';
// SK Open API (카테고리 등 공개 API)
const SK_OPENAPI_BASE = 'https://apis.openapi.sk.com/11st';

export class ElevenstAdapter extends BaseAdapter {
  channel: Channel = 'elevenst';
  private apiKey = '';       // 셀러 API Key (openapikey)
  private skAppKey = '';     // SK Open API Key (선택, 카테고리용)

  capabilities: ChannelCapabilities = {
    canCreate: true,
    multiOption: false,        // 11번가 옵션 등록은 별도 — P4는 단일
    optionPrice: 'absolute',
    maxImages: 10,             // prdImage01~10
    selfHostedImages: false,   // 외부 URL 허용(추후 검증 — 11번가 이미지 업로드 필요 시 P5)
    requiresNotice: false,
    requiresShipTemplate: true,
  };

  /**
   * Canonical → 11번가 상품등록 페이로드 (POST /rest/sellerApi/product).
   * ⚠️ 11번가 셀러 API 는 XML 기반이 많고 필드명이 셀러 가이드별로 상이 →
   *    실연동 시 판매자 개발가이드로 필드명 검증 필요. 아래는 공개 문서 기반 best-effort.
   */
  mapFromCanonical(product: CanonicalProduct, ctx: ChannelMappingContext): ChannelMappingResult {
    const t = ctx.shippingTemplate;
    if (!t?.outboundPlaceCode) {
      return { ok: false, status: 'needs_input', missing: [{ field: 'ship_template', reason: '11번가 발송정보(출고지) 필요' }] };
    }
    const { representative, extras } = pickImages(product, ctx);
    const totalStock = product.options.reduce((s, o) => s + (o.stock ?? 0), 0) || 999;

    const imageFields: Record<string, string> = { prdImage01: representative };
    extras.slice(0, 9).forEach((url, i) => { imageFields[`prdImage${String(i + 2).padStart(2, '0')}`] = url; });

    const payload: Record<string, unknown> = {
      selPrdNm: cleanName(product, 100),     // 상품명
      dispCtgrNo: ctx.channelCategoryId,     // 전시 카테고리 번호
      selPrice: ctx.sellingPrice,            // 판매가
      prdStockAmt: totalStock,               // 재고
      htmlDetail: composeDetail(product, ctx),
      ...imageFields,
      // 배송/반품/AS (템플릿)
      dlvCstInstBasiCd: t.deliveryChargeType === 'FREE' ? '01' : '02', // 무료/유료(코드 검증 필요)
      dlvCst1: t.deliveryCharge ?? 0,
      rtngdDlvCst: t.returnCharge ?? 0,
      exchDlvCst: t.exchangeCharge ?? 0,
      asDetail: t.afterServiceGuide || '판매자 문의',
      asTel: t.afterServiceTel || '',
      outsideDlvCnYn: 'N',
      brandNm: product.brand || undefined,
    };

    const warnings: string[] = ['11번가 페이로드 필드명은 실연동 시 셀러 가이드로 검증 필요'];
    if (product.options.length > 1) warnings.push(`다옵션 ${product.options.length}개 — 11번가 단일 등록(옵션 P5)`);

    return { ok: true, payload, warnings };
  }

  /**
   * 11번가 셀러 API 호출
   * - 셀러 API는 XML 기반이 많으나, 일부 JSON 지원
   * - Content-Type/Accept에 따라 응답 형식 결정
   */
  private async elevenstApi<T>(method: string, path: string, body?: unknown, options?: { xml?: boolean; apiCode?: string }): Promise<T> {
    const isXml = options?.xml ?? false;

    let url: string;
    if (options?.apiCode) {
      // 레거시 API: OpenApiService.tmall?key={key}&apiCode={code}&...
      url = `${ELEVENST_SELLER_API_BASE}/OpenApiService.tmall?key=${this.apiKey}&apiCode=${options.apiCode}`;
      if (typeof body === 'string') url += body; // query params
    } else {
      url = `${ELEVENST_SELLER_API_BASE}${path}`;
    }

    const headers: Record<string, string> = {
      openapikey: this.apiKey,
      'Content-Type': isXml ? 'application/xml' : 'application/json',
      Accept: isXml ? 'application/xml' : 'application/json',
    };

    let payload: string | undefined;
    if (body && !options?.apiCode) {
      payload = isXml ? (body as string) : JSON.stringify(body);
    }

    // 11번가는 호출 IP 화이트리스트 필수 → Fly 고정 IP 프록시 경유(미설정 시 직접 호출 폴백)
    const res = await channelFetch(url, { method, headers, body: payload });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`11번가 API ${res.status}: ${res.body.slice(0, 500)}`);
    }

    // XML 이 기본인 엔드포인트가 많다 — contentType 으로 판별해 파싱 방식을 가른다.
    const looksXml = isXml || /xml/i.test(res.contentType) || res.body.trimStart().startsWith('<');
    if (looksXml) {
      // 11번가 XML 오류는 HTTP 200 으로 내려오는 경우가 있어 본문에서 결과코드를 확인한다.
      const resultCode = xmlTag(res.body, 'resultCode');
      if (resultCode && resultCode !== '200' && resultCode !== '0') {
        const msg = xmlTag(res.body, 'resultMessage') || xmlTag(res.body, 'message') || res.body.slice(0, 300);
        throw new Error(`11번가 API 오류(${resultCode}): ${msg}`);
      }
      // 호출측이 태그를 직접 뽑아 쓸 수 있도록 원문을 함께 넘긴다.
      return { __xml: res.body } as unknown as T;
    }

    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`11번가 응답 파싱 실패: ${res.body.slice(0, 300)}`);
    }
  }

  /** XML 응답 래퍼에서 태그 값 추출 (elevenstApi 가 { __xml } 을 반환한 경우) */
  private fromXml(data: unknown, tag: string): string | null {
    const raw = (data as { __xml?: string } | null)?.__xml;
    return typeof raw === 'string' ? xmlTag(raw, tag) : null;
  }

  /**
   * SK Open API 호출 (카테고리 등 공개 API)
   */
  private async skApi<T>(path: string): Promise<T> {
    const url = `${SK_OPENAPI_BASE}${path}`;
    const res = await channelFetch(url, {
      method: 'GET',
      headers: { appKey: this.skAppKey || this.apiKey, Accept: 'application/json' },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`SK Open API ${res.status}: ${res.body.slice(0, 300)}`);
    }
    return JSON.parse(res.body) as T;
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.apiKey = credentials.apiKey as string;
    this.skAppKey = (credentials.skAppKey as string) || '';
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      // 카테고리 API로 연결 테스트 (가장 안전한 읽기 전용)
      if (this.skAppKey) {
        await this.skApi('/category');
      }
      const note = isChannelProxyConfigured()
        ? ''
        : ' (경고: 고정 IP 프록시 미설정 — 프로덕션에서는 IP 화이트리스트에 막힙니다)';
      return { success: true, message: `11번가 연결 성공${note}` };
    } catch (err) {
      return { success: false, message: `11번가 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    // 셀러 API 상품 검색 (정확한 경로는 셀러 로그인 후 확인 필요)
    const data = await this.elevenstApi<{ products: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/product/search?page=${page}&pageSize=${size}`,
    );
    return { items: (data.products || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    // 상품 등록 (일 500건 제한, 최대 10,000건)
    const data = await this.elevenstApi<{ productNo?: string }>('POST', '/rest/sellerApi/product', product);
    // JSON 이면 productNo, XML 이면 <prdNo>/<productNo> 에서 추출
    const productNo = data?.productNo
      || this.fromXml(data, 'prdNo')
      || this.fromXml(data, 'productNo');
    if (!productNo) {
      throw new Error('11번가 등록 응답에 상품번호가 없습니다 — 응답 스펙 확인 필요');
    }
    return { channelProductId: productNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    // 11번가는 삭제보다 판매중지 처리가 일반적
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/status`, { selStatCd: 'STOP' });
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/price`, { selPrice: price });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    // 재고처리 API
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/stock`, { stockQty: stock });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    // 판매중지 API
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/status`, { selStatCd: 'STOP' });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/product/${channelProductId}/status`, { selStatCd: 'ON' });
    return { success: true };
  }

  // ── 주문 ──

  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const data = await this.elevenstApi<{ orders: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/order/search?startDate=${startDate}&endDate=${endDate}&page=${page}&pageSize=50`,
    );
    return { items: (data.orders || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async confirmOrder(channelOrderId: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/order/${channelOrderId}/confirm`);
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/order/${channelOrderId}/invoice`, {
      deliveryCompanyCode: courierCode,
      invoiceNo: invoiceNumber,
    });
    return { success: true };
  }

  async cancelOrder(channelOrderId: string, reason: string) {
    await this.elevenstApi('PUT', `/rest/sellerApi/order/${channelOrderId}/cancel`, { cancelReason: reason });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    // 상품 Q&A API
    const data = await this.elevenstApi<{ inquiries: unknown[]; totalCount: number }>(
      'GET', `/rest/sellerApi/qna?page=${page}&pageSize=50`,
    );
    return { items: (data.inquiries || []) as Record<string, unknown>[], totalCount: data.totalCount || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.elevenstApi('POST', `/rest/sellerApi/qna/${inquiryId}/answer`, { answer });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    const data = await this.elevenstApi<{ settlements: unknown[] }>(
      'GET', `/rest/sellerApi/settlement?startDate=${params.startDate}&endDate=${params.endDate}`,
    );
    return { items: (data.settlements || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    if (this.skAppKey) {
      // SK Open API로 전체 카테고리 조회 (JSON)
      const data = await this.skApi<{ Category: { depth: number; dispNm: string; dispNo: string; parentDispNo: string }[] }>('/category');
      const cats = data.Category || [];
      const filtered = parentId
        ? cats.filter(c => c.parentDispNo === parentId)
        : cats.filter(c => c.depth === 1);
      return {
        items: filtered.map(c => ({ id: c.dispNo, name: c.dispNm, parentId: c.parentDispNo || undefined })),
      };
    }

    // 레거시 XML API: apiCode=CategoryInfo
    const data = await this.elevenstApi<{ categories: { categoryId: string; categoryName: string }[] }>(
      'GET', '', `&categoryCode=${parentId || ''}`, { apiCode: 'CategoryInfo' },
    );
    return {
      items: (data.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName, parentId })),
    };
  }

  async searchCategory(keyword: string) {
    if (this.skAppKey) {
      // SK Open API 전체 카테고리에서 필터링
      const data = await this.skApi<{ Category: { depth: number; dispNm: string; dispNo: string }[] }>('/category');
      const matched = (data.Category || []).filter(c => c.dispNm?.includes(keyword));
      return {
        items: matched.slice(0, 20).map(c => ({ id: c.dispNo, name: c.dispNm, path: c.dispNm })),
      };
    }

    // 레거시: apiCode=ProductSearch로 카테고리 검색
    const data = await this.elevenstApi<{ categories: { categoryId: string; categoryName: string; fullPath: string }[] }>(
      'GET', '', `&keyword=${encodeURIComponent(keyword)}`, { apiCode: 'ProductSearch' },
    );
    return {
      items: (data.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName, path: c.fullPath })),
    };
  }
}
