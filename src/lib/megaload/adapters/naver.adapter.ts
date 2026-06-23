/**
 * 네이버 커머스 API (스마트스토어) 어댑터
 *
 * 공식 문서: https://apicenter.commerce.naver.com
 * GitHub: https://github.com/commerce-api-naver/commerce-api
 *
 * 인증: OAuth 2.0 Client Credentials + bcrypt 서명
 * Base URL: https://api.commerce.naver.com/external
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import type {
  CanonicalProduct,
  ChannelCapabilities,
  ChannelMappingContext,
  ChannelMappingResult,
  MissingField,
} from '../services/canonical-product';
import bcrypt from 'bcryptjs';

const NAVER_API_BASE = 'https://api.commerce.naver.com/external';

export class NaverAdapter extends BaseAdapter {
  channel: Channel = 'naver';
  private clientId = '';
  private clientSecret = ''; // bcrypt salt (starts with $2a$)
  private accessToken = '';
  private tokenExpiresAt = 0;

  capabilities: ChannelCapabilities = {
    canCreate: true,
    multiOption: true,           // P3: optionInfo 상대가 옵션 등록
    optionPrice: 'relative',     // 네이버 옵션가는 대표가 대비 상대가
    maxImages: 10,               // 대표 1 + 추가 9
    selfHostedImages: true,      // 상세/대표 이미지 네이버 서버 재호스팅 필요(P3)
    requiresNotice: false,       // P1: 일반 고시 폴백 사용(경고). 정밀 고시매핑은 P3
    requiresShipTemplate: true,  // 출고지·반품지·배송비·AS 필수
  };

  /**
   * Canonical → 네이버 커머스 v2 /v2/products 페이로드.
   * 필수 셀러값(배송템플릿)은 매퍼가 사전 검증하지만, 어댑터에서도 방어적으로 재확인.
   * P1 범위: 단일 대표가 등록. 다옵션 옵션단위·이미지 재호스팅·정밀 고시는 P3.
   */
  mapFromCanonical(product: CanonicalProduct, ctx: ChannelMappingContext): ChannelMappingResult {
    const missing: MissingField[] = [];
    const warnings: string[] = [];

    if (!ctx.channelCategoryId) {
      missing.push({ field: 'category', reason: '네이버 카테고리 매핑이 필요합니다' });
    }

    const mainImages = product.images.filter((i) => i.role === 'main').map((i) => i.url);
    const extraImages = product.images.filter((i) => i.role !== 'main').map((i) => i.url);
    const representative = mainImages[0] || product.images[0]?.url;
    if (!representative) {
      missing.push({ field: 'image', reason: '대표 이미지가 없습니다' });
    }

    const name = (product.displayName || product.name || '').trim().slice(0, 100);
    if (!name) missing.push({ field: 'name', reason: '상품명이 비어 있습니다' });
    if (ctx.sellingPrice <= 0) missing.push({ field: 'price', reason: '판매가가 0입니다' });

    const tpl = ctx.shippingTemplate;
    if (!tpl?.outboundPlaceCode || !tpl?.returnCenterCode) {
      missing.push({ field: 'ship_template', reason: '출고지/반품지 코드가 필요합니다 (채널 배송 설정)' });
    }
    if (!tpl?.afterServiceTel || !tpl?.afterServiceGuide) {
      missing.push({ field: 'as_info', reason: 'A/S 전화·안내가 필요합니다 (채널 배송 설정)' });
    }

    if (missing.length > 0) {
      return { ok: false, status: 'needs_input', missing };
    }

    // ── 이미지 재호스팅 적용 (네이버는 외부 URL 거부) — 러너가 사전 업로드한 맵으로 치환 ──
    const swap = (u: string): string => ctx.rehostedImages?.get(u) || u;
    const repHosted = swap(representative as string);
    const optionalHosted = extraImages.slice(0, 9).map(swap);
    if (this.capabilities.selfHostedImages && !ctx.rehostedImages) {
      warnings.push('이미지 재호스팅 맵 미주입 — 외부 URL로 등록 시도(거부 가능)');
    }
    if (Object.keys(product.notices).length === 0) {
      warnings.push('상품정보고시 일반 폴백 사용(상세페이지 참조)');
    }

    // 상세 HTML 내 <img src> 도 재호스팅 URL 로 치환
    let detailHtml = `${ctx.headerHtml || ''}${product.detailHtml || ''}${ctx.footerHtml || ''}`;
    detailHtml = detailHtml.replace(/(<img[^>]+src=["'])([^"']+)(["'])/gi, (_m, a, src, c) => `${a}${swap(src)}${c}`);
    if (!detailHtml) detailHtml = '<p>상세페이지 참조</p>';

    // ── 가격/옵션 (다옵션은 상대가 optionInfo 구성) ──
    const m = ctx.marginPercent || 0;
    const adj = (p: number) => Math.round(p * (1 + m / 100));
    const isMulti = product.options.length > 1;
    const optionAdjusted = product.options.map((o) => adj(o.salePrice)).filter((p) => p > 0);
    const baseSalePrice = isMulti && optionAdjusted.length > 0 ? Math.min(...optionAdjusted) : ctx.sellingPrice;
    const totalStock = product.options.reduce((s, o) => s + (o.stock ?? 0), 0) || 999;

    const optionInfo = isMulti
      ? {
          optionCombinationGroupNames: { optionGroupName1: '옵션' },
          optionCombinations: product.options.map((o) => ({
            optionName1: o.optionName,
            stockQuantity: o.stock ?? 999,
            price: Math.max(0, adj(o.salePrice) - baseSalePrice), // 대표가 대비 상대가(>=0)
            sellerManagerCode: o.sku || undefined,
            usable: true,
          })),
          useStockManagement: true,
        }
      : undefined;

    const detailAttribute: Record<string, unknown> = {
      naverShoppingSearchInfo: {
        manufacturerName: product.manufacturer || product.brand || '제조사',
        brandName: product.brand || undefined,
      },
      afterServiceInfo: {
        afterServiceTelephoneNumber: tpl!.afterServiceTel,
        afterServiceGuideContent: tpl!.afterServiceGuide,
      },
      originAreaInfo: {
        originAreaCode: tpl!.originCode || '0200037', // 기타(상세설명참조)
        content: product.origin || undefined,
      },
      sellerCodeInfo: {
        sellerManagementCode: ctx.sellerManagementCode || product.options[0]?.sku || product.productId.slice(0, 24),
      },
      minorPurchasable: true,
      ...(optionInfo ? { optionInfo } : {}),
    };

    const payload: Record<string, unknown> = {
      originProduct: {
        statusType: 'SALE',
        saleType: 'NEW',
        leafCategoryId: ctx.channelCategoryId,
        name,
        detailContent: detailHtml,
        images: {
          representativeImage: { url: repHosted },
          optionalImages: optionalHosted.map((url) => ({ url })),
        },
        salePrice: baseSalePrice,
        stockQuantity: totalStock,
        deliveryInfo: {
          deliveryType: 'DELIVERY',
          deliveryAttributeType: 'NORMAL',
          deliveryFee: {
            deliveryFeeType: tpl!.deliveryChargeType === 'FREE' ? 'FREE'
              : tpl!.deliveryChargeType === 'CONDITIONAL_FREE' ? 'CONDITIONAL_FREE' : 'PAID',
            baseFee: tpl!.deliveryCharge ?? 0,
            freeConditionalAmount: tpl!.freeShipOverAmount ?? 0,
            deliveryFeePayType: 'PREPAID',
          },
          claimDeliveryInfo: {
            returnDeliveryFee: tpl!.returnCharge ?? 0,
            exchangeDeliveryFee: tpl!.exchangeCharge ?? (tpl!.returnCharge ?? 0) * 2,
          },
          outboundLocationId: tpl!.outboundPlaceCode,
          returnLocationId: tpl!.returnCenterCode,
        },
        detailAttribute,
      },
      smartstoreChannelProduct: {
        naverShoppingRegistration: true,
        channelProductDisplayStatusType: 'ON',
        channelProductName: name,
      },
    };

    return { ok: true, payload, warnings: warnings.length ? warnings : undefined };
  }

  /**
   * 원본 이미지 URL → 네이버 이미지서버 업로드 후 네이버 URL 반환.
   * 네이버는 외부 URL 을 거부하므로 등록 전 필수. (캐시는 channel-image-rehost 가 담당)
   */
  async uploadImage(sourceUrl: string): Promise<string> {
    const imgRes = await fetch(sourceUrl);
    if (!imgRes.ok) throw new Error(`이미지 다운로드 실패 ${imgRes.status}: ${sourceUrl.slice(0, 80)}`);
    const buf = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

    const token = await this.ensureToken();
    const form = new FormData();
    form.append('imageFiles', new Blob([buf], { type: contentType }), `image.${ext}`);

    const res = await fetch(`${NAVER_API_BASE}/v1/product-images/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // multipart boundary 는 fetch 가 자동 설정
      body: form,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`네이버 이미지 업로드 실패 ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as { images?: { url: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) throw new Error('네이버 이미지 업로드 응답에 URL 없음');
    return url;
  }

  /**
   * OAuth 2.0 토큰 발급
   * - timestamp: 현재 시간 - 3초 (밀리초)
   * - password: {clientId}_{timestamp}
   * - clientSecretSign: Base64(bcrypt(password, clientSecret))
   */
  private async fetchToken(): Promise<string> {
    const timestamp = String(Math.round(Date.now() - 3000));
    const password = `${this.clientId}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, this.clientSecret);
    const clientSecretSign = Buffer.from(hashed).toString('base64');

    const params = new URLSearchParams({
      client_id: this.clientId,
      timestamp,
      client_secret_sign: clientSecretSign,
      grant_type: 'client_credentials',
      type: 'SELF',
    });

    const res = await fetch(
      `${NAVER_API_BASE}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`네이버 토큰 발급 실패: ${res.status} ${text}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 만료 1분 전 갱신
    return this.accessToken;
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      return this.fetchToken();
    }
    return this.accessToken;
  }

  private async naverApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.ensureToken();
    const url = `${NAVER_API_BASE}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
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
      this.clientId = credentials.clientId as string;
      this.clientSecret = credentials.clientSecret as string;
      await this.fetchToken();
      return { success: true, message: '네이버 스마트스토어 연결 성공' };
    } catch (err) {
      return { success: false, message: `네이버 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  async getProducts(params: { page?: number; size?: number; status?: string }) {
    const { page = 1, size = 100 } = params;
    // 네이버는 상품 검색이 POST (v1)
    const data = await this.naverApi<{ contents: unknown[]; totalElements: number }>(
      'POST',
      '/v1/products/search',
      { page, size },
    );
    return { items: (data.contents || []) as Record<string, unknown>[], totalCount: data.totalElements || 0 };
  }

  async createProduct(product: Record<string, unknown>) {
    const data = await this.naverApi<{ originProductNo: string; smartstoreChannelProductNo: string }>(
      'POST', '/v2/products', product,
    );
    return { channelProductId: data.smartstoreChannelProductNo || data.originProductNo, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    // 원상품 번호 기반 수정
    await this.naverApi('PUT', `/v2/products/origin-products/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.naverApi('DELETE', `/v2/products/origin-products/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    await this.naverApi('PUT', `/v2/products/origin-products/${channelProductId}`, {
      originProduct: { salePrice: price },
    });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    await this.naverApi('PUT', `/v2/products/origin-products/${channelProductId}`, {
      originProduct: { stockQuantity: stock },
    });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    await this.naverApi('PUT', `/v2/products/channel-products/${channelProductId}`, {
      channelProductDisplayStatusType: 'SUSPENSION',
    });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    await this.naverApi('PUT', `/v2/products/channel-products/${channelProductId}`, {
      channelProductDisplayStatusType: 'ON',
    });
    return { success: true };
  }

  // ── 주문 ──

  /**
   * 변경된 상품 주문 내역 조회 (last-changed-statuses → query)
   * 주의: 쿼리 범위 최대 24시간 제한
   */
  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate } = params;

    // 1단계: 변경된 주문 ID 가져오기
    const changedQuery = new URLSearchParams({
      lastChangedFrom: `${startDate}T00:00:00.000+09:00`,
      lastChangedTo: `${endDate}T23:59:59.000+09:00`,
    });
    if (params.status) changedQuery.set('lastChangedType', params.status);

    const changed = await this.naverApi<{ data: { lastChangeStatuses: { productOrderId: string }[] } }>(
      'GET',
      `/v1/pay-order/seller/product-orders/last-changed-statuses?${changedQuery.toString()}`,
    );

    const productOrderIds = (changed.data?.lastChangeStatuses || []).map(s => s.productOrderId);
    if (productOrderIds.length === 0) {
      return { items: [], totalCount: 0 };
    }

    // 2단계: 주문 상세 조회
    const details = await this.naverApi<{ data: unknown[] }>(
      'POST',
      '/v1/pay-order/seller/product-orders/query',
      { productOrderIds },
    );

    return { items: (details.data || []) as Record<string, unknown>[], totalCount: productOrderIds.length };
  }

  async confirmOrder(channelOrderId: string) {
    await this.naverApi('POST', '/v1/pay-order/seller/product-orders/confirm', {
      productOrderIds: [channelOrderId],
    });
    return { success: true };
  }

  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.naverApi('POST', '/v1/pay-order/seller/product-orders/dispatch', {
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
    await this.naverApi('POST', '/v1/pay-order/seller/product-orders/cancel', {
      productOrderId: channelOrderId,
      cancelReason: reason,
    });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { page = 1 } = params;
    const data = await this.naverApi<{ contents: unknown[]; totalElements: number }>(
      'POST', '/v1/pay-user/inquiries',
      { page, size: 50 },
    );
    return { items: (data.contents || []) as Record<string, unknown>[], totalCount: data.totalElements || 0 };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.naverApi('POST', `/v1/pay-user/inquiries/${inquiryId}/answer`, { content: answer });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    // 네이버 정산은 주문 기반으로 조회
    const data = await this.naverApi<{ data: unknown[] }>(
      'GET', `/v1/pay-order/seller/settlements?from=${params.startDate}&to=${params.endDate}`,
    );
    return { items: (data.data || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    const data = await this.naverApi<unknown[]>('GET', '/v1/categories');
    // 전체 카테고리 트리에서 parentId 필터링
    const all = (data || []) as { id: string; name: string; parentCategoryId?: string }[];
    const filtered = parentId
      ? all.filter(c => c.parentCategoryId === parentId)
      : all.filter(c => !c.parentCategoryId);
    return {
      items: filtered.map(c => ({ id: String(c.id), name: c.name, parentId: c.parentCategoryId })),
    };
  }

  async searchCategory(keyword: string) {
    // 네이버는 카테고리 검색 전용 API가 없으므로 전체 조회 후 필터링
    const data = await this.naverApi<unknown[]>('GET', '/v1/categories');
    const all = (data || []) as { id: string; name: string; wholeCategoryName?: string }[];
    const matched = all.filter(c =>
      c.name?.includes(keyword) || c.wholeCategoryName?.includes(keyword)
    );
    return {
      items: matched.slice(0, 20).map(c => ({
        id: String(c.id),
        name: c.name,
        path: c.wholeCategoryName || c.name,
      })),
    };
  }
}
