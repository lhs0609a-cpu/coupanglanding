/**
 * ESM Trading API 어댑터 (G마켓 / 옥션)
 *
 * 공식 문서: https://etapi.gmarket.com
 * (구 etapi.ebaykorea.com → 2022.12.01 gmarket 도메인으로 이전)
 *
 * 인증: JWT (HS256 HMAC) — kid=마스터ID, ssi=A:{옥션ID},G:{지마켓ID}
 * Base URL: https://sa2.esmplus.com
 *
 * 주의:
 * - SiteType 값: 옥션=1, G마켓=2 (취소조회만 G마켓=3)
 * - 정산 API에서는 옥션="A", G마켓="G" (문자열)
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import type {
  CanonicalProduct, ChannelCapabilities, ChannelMappingContext, ChannelMappingResult, MissingField,
} from '../services/canonical-product';
import { pickImages, composeDetail, cleanName } from './mapping-helpers';
import crypto from 'crypto';

const ESM_API_BASE = 'https://sa2.esmplus.com';

export class EsmAdapter extends BaseAdapter {
  channel: Channel;
  private masterId = '';    // ESM+ 마스터ID (JWT kid)
  private secretKey = '';   // HMAC Secret Key (이메일 신청으로 발급)
  private sellerId = '';    // 사이트별 셀러ID (G마켓 또는 옥션)
  private siteType: number; // 1=옥션, 2=G마켓

  capabilities: ChannelCapabilities = {
    canCreate: true,
    multiOption: false,        // ESM 옵션 등록은 별도 — P4는 단일
    optionPrice: 'absolute',
    maxImages: 10,
    selfHostedImages: false,   // 외부 URL 허용(실연동 검증)
    requiresNotice: false,
    requiresShipTemplate: true,
  };

  constructor(channel: 'gmarket' | 'auction') {
    super();
    this.channel = channel;
    this.siteType = channel === 'gmarket' ? 2 : 1;
  }

  /** 등록 페이로드 price/stock 키 — 등록은 대문자(Gmkt/Iac). 한 인스턴스=한 마켓만 채움. */
  private marketKey(): 'Gmkt' | 'Iac' {
    return this.channel === 'gmarket' ? 'Gmkt' : 'Iac';
  }

  /** sell-status(가격/재고/판매상태) 키 — ESM 문서상 소문자(gmkt/iac). 등록 키와 대소문자 다름(ESM 비일관성). */
  private sellStatusKey(): 'gmkt' | 'iac' {
    return this.channel === 'gmarket' ? 'gmkt' : 'iac';
  }

  /**
   * Canonical → ESM goods 등록 페이로드 (POST /item/v1/goods).
   *
   * 실제 스키마는 중첩(itemBasicInfo / itemAddtionalInfo)이며 price/stock 은 마켓별 키
   * (Gmkt/Iac)로 구분한다. 한 어댑터 인스턴스 = 한 마켓 → 해당 마켓 키만 채운다.
   *
   * ⚠️ 'itemAddtionalInfo' 는 ESM API 원문 오탈자(Addtional) 그대로다 — 오타 아님.
   * ⚠️ 고시정보(officialNotice)/추가이미지/AS 필드는 실계정 첫 등록 응답으로 최종 검증 필요.
   */
  mapFromCanonical(product: CanonicalProduct, ctx: ChannelMappingContext): ChannelMappingResult {
    const t = ctx.shippingTemplate;
    const { representative, extras } = pickImages(product, ctx);

    // 필수값 누락은 채널 호출 없이 needs_input 으로 모아서 보류(예외큐 노출)
    const missing: MissingField[] = [];
    if (!t?.outboundPlaceCode) missing.push({ field: 'ship_template', reason: 'ESM 발송정보(출고지 placeNo) 필요' });
    if (!ctx.channelCategoryId) missing.push({ field: 'category', reason: 'ESM leaf 카테고리(catCode) 매핑 필요' });
    if (!representative) missing.push({ field: 'image', reason: 'ESM 대표이미지(basicImgURL, 최소 600x600) 필요' });
    if (missing.length > 0) return { ok: false, status: 'needs_input', missing };

    const mk = this.marketKey();
    const totalStock = Math.max(1, product.options.reduce((s, o) => s + (o.stock ?? 0), 0) || 999); // ESM 재고 >=1 필수

    // 추가이미지: image-modify 스키마(AdditionalImage1..14) 준용 — 실연동 검증 대상
    const additional: Record<string, string> = {};
    extras.slice(0, 14).forEach((url, i) => { additional[`AdditionalImage${i + 1}`] = url; });

    const payload: Record<string, unknown> = {
      itemBasicInfo: {
        goodsName: { kor: cleanName(product, 100) },
        // category.site 는 사이트별 엔트리 배열(N:N) — 한 인스턴스=한 마켓이라 엔트리 1개.
        // ctx.channelCategoryId 는 해당 사이트(siteType)의 leaf catCode 여야 함(9자리).
        category: {
          site: [{ siteType: this.siteType, catCode: ctx.channelCategoryId }], // 1=옥션, 2=G마켓
        },
      },
      // ⚠️ 원문 오탈자 'itemAddtionalInfo' 그대로 (ESM API 실제 필드명)
      itemAddtionalInfo: {
        price: { [mk]: ctx.sellingPrice },   // 10원~10억원
        stock: { [mk]: totalStock },
        shipping: {
          type: 1,                            // 1=택배
          policy: { placeNo: Number(t!.outboundPlaceCode) || undefined },
          ...(t!.returnCenterCode ? { returnPlaceNo: Number(t!.returnCenterCode) || undefined } : {}),
          deliveryFee: t!.deliveryChargeType === 'FREE' ? 0 : (t!.deliveryCharge ?? 0),
          returnFee: t!.returnCharge ?? 0,
          exchangeFee: t!.exchangeCharge ?? 0,
        },
        images: { basicImgURL: representative, ...additional },
        descriptions: { kor: { html: composeDetail(product, ctx) } },
        isVatFree: false,
        recommendedOpts: { type: 0 },         // 0=단일옵션 (다옵션 P5)
        ...(product.brand ? { brand: { name: product.brand } } : {}),
        ...(t!.afterServiceTel || t!.afterServiceGuide
          ? { afterService: { telephone: t!.afterServiceTel || '', guide: t!.afterServiceGuide || '판매자 문의' } }
          : {}),
        sellerManageCode: product.options[0]?.sku || ctx.sellerManagementCode || undefined,
      },
    };

    const warnings: string[] = ['ESM /item/v1/goods 페이로드는 실계정 첫 등록 응답으로 최종 검증 필요(고시정보/추가이미지/AS 필드명)'];
    if (product.options.length > 1) warnings.push(`다옵션 ${product.options.length}개 — 현재 단일 등록(옵션 P5)`);

    return { ok: true, payload, warnings };
  }

  /**
   * JWT 토큰 생성 (HS256)
   * Header: { "alg": "HS256", "typ": "JWT", "kid": "{masterId}" }
   * Payload: { "iss": "{domain}", "sub": "sell", "aud": "sa.esmplus.com", "iat": timestamp, "ssi": "A:{auctionId},G:{gmarketId}" }
   */
  private generateJwt(): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
      kid: this.masterId,
    };

    const sitePrefix = this.channel === 'gmarket' ? 'G' : 'A';
    const payload = {
      iss: 'megaload.app',
      sub: 'sell',
      aud: 'sa.esmplus.com',
      iat: Math.floor(Date.now() / 1000),
      ssi: `${sitePrefix}:${this.sellerId}`,
    };

    const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${encHeader}.${encPayload}`)
      .digest('base64url');

    return `${encHeader}.${encPayload}.${signature}`;
  }

  private async esmApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.generateJwt();
    const url = `${ESM_API_BASE}${path}`;

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
    this.masterId = credentials.masterId as string || credentials.userId as string;
    this.secretKey = credentials.secretKey as string || credentials.apiKey as string;
    this.sellerId = credentials.sellerId as string || this.masterId;
    return true;
  }

  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      // 상품 검색으로 연결 테스트 (1개만)
      await this.esmApi('POST', '/item/v1/goods/search', { pageNo: 1, pageSize: 1 });
      const label = this.channel === 'gmarket' ? 'G마켓' : '옥션';
      return { success: true, message: `${label} 연결 성공` };
    } catch (err) {
      return { success: false, message: `연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
  }

  // ── 상품 ──

  async getProducts(params: { page?: number; size?: number }) {
    const { page = 1, size = 100 } = params;
    // POST /item/v1/goods/search (30회/분, 최대 500건)
    const data = await this.esmApi<{ data: { items: unknown[]; totalCount: number } }>(
      'POST', '/item/v1/goods/search',
      { pageNo: page, pageSize: Math.min(size, 500), siteType: this.siteType },
    );
    return {
      items: (data.data?.items || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  async createProduct(product: Record<string, unknown>) {
    // ESM 은 HTTP 200 안에 resultCode 로 실패를 담아 보낸다(apiCall 은 200이면 통과) → 여기서 명시 검증.
    const res = await this.esmApi<{
      goodsNo?: number | string;
      resultCode?: number;
      message?: string | null;
      siteDetail?: {
        gmkt?: { SiteGoodsNo?: string; SiteGoodsComment?: string };
        iac?: { SiteGoodsNo?: string; SiteGoodsComment?: string };
      };
    }>('POST', '/item/v1/goods', product);

    if (res.resultCode !== undefined && res.resultCode !== 0) {
      throw new Error(`ESM 등록 실패(resultCode=${res.resultCode}): ${res.message || '사유 미상'}`);
    }
    // 마스터 등록은 성공해도 사이트별(G마켓/옥션) 등록이 개별 실패할 수 있음 → SiteGoodsNo 없으면 실패로 표면화
    const site = this.channel === 'gmarket' ? res.siteDetail?.gmkt : res.siteDetail?.iac;
    if (site && !site.SiteGoodsNo) {
      throw new Error(`ESM ${this.channel} 사이트 등록 실패: ${site.SiteGoodsComment || '사유 미상'}`);
    }
    const channelProductId = String(res.goodsNo ?? site?.SiteGoodsNo ?? '');
    if (!channelProductId) {
      throw new Error('ESM 등록 응답에 상품번호(goodsNo)가 없습니다');
    }
    return { channelProductId, success: true };
  }

  async updateProduct(channelProductId: string, product: Record<string, unknown>) {
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}`, product);
    return { success: true };
  }

  async deleteProduct(channelProductId: string) {
    await this.esmApi('DELETE', `/item/v1/goods/${channelProductId}`);
    return { success: true };
  }

  async updatePrice(channelProductId: string, price: number) {
    // PUT /item/v1/goods/{goodsNo}/sell-status — 마켓별 키(소문자)로 가격만 갱신
    const k = this.sellStatusKey();
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      itemBasicInfo: { price: { [k]: price } },
    });
    return { success: true };
  }

  async updateStock(channelProductId: string, stock: number) {
    const k = this.sellStatusKey();
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      itemBasicInfo: { stock: { [k]: stock } },
    });
    return { success: true };
  }

  async suspendProduct(channelProductId: string) {
    const k = this.sellStatusKey();
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      isSell: { [k]: false },
    });
    return { success: true };
  }

  async resumeProduct(channelProductId: string) {
    const k = this.sellStatusKey();
    await this.esmApi('PUT', `/item/v1/goods/${channelProductId}/sell-status`, {
      isSell: { [k]: true },
    });
    return { success: true };
  }

  // ── 주문 ──

  /**
   * 결제완료 주문 조회: POST /shipping/v1/Order/RequestOrders (5초당 1회)
   */
  async getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }) {
    const { startDate, endDate } = params;
    const data = await this.esmApi<{ data: { orders: unknown[]; totalCount: number } }>(
      'POST', '/shipping/v1/Order/RequestOrders',
      {
        siteType: this.siteType,
        startDate: startDate.replace(/-/g, ''),
        endDate: endDate.replace(/-/g, ''),
      },
    );
    return {
      items: (data.data?.orders || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  /**
   * 주문 확인: POST /shipping/v1/Order/OrderCheck/{OrderNo}
   */
  async confirmOrder(channelOrderId: string) {
    await this.esmApi('POST', `/shipping/v1/Order/OrderCheck/${channelOrderId}`, {
      siteType: this.siteType,
    });
    return { success: true };
  }

  /**
   * 송장 등록: POST /shipping/v1/Delivery/ShippingInfo
   */
  async registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string) {
    await this.esmApi('POST', '/shipping/v1/Delivery/ShippingInfo', {
      siteType: this.siteType,
      orderNo: channelOrderId,
      deliveryCompanyCode: courierCode,
      invoiceNo: invoiceNumber,
    });
    return { success: true };
  }

  /**
   * 판매자 취소: POST /claim/v1/sa/Cancel/{OrderNo}/SoldOut
   */
  async cancelOrder(channelOrderId: string, reason: string) {
    // 취소조회: G마켓 siteType=3 (예외)
    const cancelSiteType = this.channel === 'gmarket' ? 3 : 1;
    await this.esmApi('POST', `/claim/v1/sa/Cancel/${channelOrderId}/SoldOut`, {
      siteType: cancelSiteType,
      cancelReason: reason,
    });
    return { success: true };
  }

  // ── 문의 ──

  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    // CS API: POST /item/v1/communications/customer/bulletin-board/qna
    const data = await this.esmApi<{ data: { items: unknown[]; totalCount: number } }>(
      'POST', '/item/v1/communications/customer/bulletin-board/qna',
      { siteType: this.siteType, pageNo: params.page || 1, pageSize: 50 },
    );
    return {
      items: (data.data?.items || []) as Record<string, unknown>[],
      totalCount: data.data?.totalCount || 0,
    };
  }

  async answerInquiry(inquiryId: string, answer: string) {
    await this.esmApi('POST', '/item/v1/communications/customer/bulletin-board/qna', {
      siteType: this.siteType,
      inquiryNo: inquiryId,
      answer,
    });
    return { success: true };
  }

  // ── 정산 ──

  async getSettlements(params: { startDate: string; endDate: string }) {
    // 정산에서는 옥션="A", G마켓="G" (문자열)
    const settleSiteType = this.channel === 'gmarket' ? 'G' : 'A';
    const data = await this.esmApi<{ data: { items: unknown[] } }>(
      'POST', '/account/v1/settle/getsettleorder',
      {
        siteType: settleSiteType,
        startDate: params.startDate.replace(/-/g, ''),
        endDate: params.endDate.replace(/-/g, ''),
      },
    );
    return { items: (data.data?.items || []) as Record<string, unknown>[] };
  }

  // ── 카테고리 ──

  async getCategories(parentId?: string) {
    if (parentId) {
      // 사이트 서브카테고리: GET /item/v1/categories/site-cats/{siteCatCode}
      const data = await this.esmApi<{ data: { id: string; name: string }[] }>(
        'GET', `/item/v1/categories/site-cats/${parentId}`,
      );
      return {
        items: (data.data || []).map(c => ({ id: c.id, name: c.name, parentId })),
      };
    }

    // 사이트 최상위 카테고리: GET /item/v1/categories/site-cats
    const data = await this.esmApi<{ data: { id: string; name: string }[] }>(
      'GET', '/item/v1/categories/site-cats',
    );
    return {
      items: (data.data || []).map(c => ({ id: c.id, name: c.name })),
    };
  }

  async searchCategory(keyword: string) {
    // ESM은 카테고리 검색 API가 없으므로 전체 조회 후 클라이언트 필터링
    const data = await this.esmApi<{ data: { id: string; name: string; fullPath?: string }[] }>(
      'GET', '/item/v1/categories/site-cats',
    );
    const matched = (data.data || []).filter(c => c.name?.includes(keyword));
    return {
      items: matched.slice(0, 20).map(c => ({ id: c.id, name: c.name, path: c.fullPath || c.name })),
    };
  }
}
