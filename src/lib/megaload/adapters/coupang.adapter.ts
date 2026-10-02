import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import type { ChannelCapabilities } from '../services/canonical-product';
import crypto from 'crypto';

const COUPANG_API_BASE = 'https://api-gateway.coupang.com';

// Fly.io 프록시 URL (설정되어 있으면 프록시 경유, 없으면 직접 호출)
const COUPANG_PROXY_URL = process.env.COUPANG_PROXY_URL || '';
const COUPANG_PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || '';

/**
 * 쿠팡의 "brandId 없이 등록 불가" 거절인지 판별.
 *
 * 2026-10 정책 강화로 brandId 가 없거나 brand 가 라이브러리에 매칭되지 않으면 1차 거절되고,
 * 메시지에 재요청용 confirmationToken 이 실려 온다. 문구가 바뀌어도 걸리도록 넓게 본다.
 */
function isBrandIdRequiredError(msg: string): boolean {
  if (!msg) return false;
  return /confirmationToken/i.test(msg)
    || /brandId.{0,30}(?:필요|입력|required)/i.test(msg)
    || /브랜드\s*(?:ID|아이디).{0,20}(?:필요|입력)/i.test(msg);
}

/**
 * 거절 메시지에서 confirmationToken 을 뽑는다.
 *  - 토큰은 base64url 계열(영숫자 . _ - ~ + / =)이고 250자 내외다.
 *  - 메시지 끝에 붙어 오므로 공백/따옴표/닫는 괄호에서 끊는다(로그 포맷이 감싸는 경우 대비).
 */
function extractConfirmationToken(msg: string): string | null {
  const m = /confirmationToken\s*[=:]\s*["']?([A-Za-z0-9._~+/=-]{20,})/.exec(msg || '');
  return m ? m[1] : null;
}

export class CoupangAdapter extends BaseAdapter {
  channel: Channel = 'coupang';
  private vendorId = '';
  private accessKey = '';
  private secretKey = '';

  // 쿠팡은 마스터(소스)이므로 복제 대상이 아니다. capabilities 는 문서/대칭용 선언.
  // mapFromCanonical 은 coupang-product-builder 로 별도 구축되므로 P1 범위에서 override 안 함.
  capabilities: ChannelCapabilities = {
    canCreate: true,
    multiOption: true,
    optionPrice: 'absolute',
    selfHostedImages: false,   // 쿠팡은 외부 이미지 URL 허용
    maxImages: 10,
    requiresNotice: true,
    requiresShipTemplate: true,
  };

  /** vendorId 외부 접근 (페이로드 빌드에 필요) */
  getVendorId(): string {
    return this.vendorId;
  }

  /** 인증 정보 외부 접근 — 브랜드 API(coupang-api-client) 등 어댑터 밖 호출에 사용.
   *  authenticate() 후에만 유효. wingUserId 는 어댑터가 보관하지 않으므로 미포함. */
  getCredentials(): { vendorId: string; accessKey: string; secretKey: string } {
    return { vendorId: this.vendorId, accessKey: this.accessKey, secretKey: this.secretKey };
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

    // X-Requested-By 는 vendorId 가 있을 때만 송신 — 빈 문자열은 일부 엔드포인트에서 4xx 유발.
    // (proxy 모드의 ternary 와 동일한 로직)
    const directHeaders: Record<string, string> = {
      Authorization: authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    if (this.vendorId) {
      directHeaders['X-Requested-By'] = this.vendorId;
      directHeaders['X-EXTENDED-Timeout'] = '60000';
    }
    const options: RequestInit = {
      method,
      headers: directHeaders,
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

  /**
   * 판매자 상품 목록.
   *
   * ⚠️ 쿠팡의 `nextToken` 은 페이지 번호가 아니라 **응답으로 받아 그대로 돌려줘야 하는 커서**다.
   *    페이지 번호를 넣으면 2페이지부터 빈 배열이 온다(실측 2026-09-28: 상품 342개인 계정이
   *    page=1 에 100건, page=2 에 0건). 그래서 호출 측이 이어 받을 수 있게 nextToken 을 돌려준다.
   *    전량이 필요하면 응답의 nextToken 이 빌 때까지 다시 부른다.
   */
  async getProducts(params: { page?: number; size?: number; status?: string; nextToken?: string }) {
    const { size = 100, status, nextToken } = params;
    const path = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products';
    // 첫 호출은 nextToken=1 로 시작한다(쿠팡이 요구하는 초기값).
    const token = nextToken ?? '1';
    const queryParts = [`vendorId=${this.vendorId}`, `nextToken=${token}`, `maxPerPage=${size}`];
    if (status) queryParts.push(`status=${status}`);
    const query = queryParts.join('&');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.coupangApi<any>('GET', path, query);

    // 쿠팡 API 응답 구조 방어적 파싱:
    //  직접: { code, message, data: [...] }
    //  프록시: { data: [...] } 또는 { data: { content: [...] } }
    let items: Record<string, unknown>[] = [];
    const payload = raw?.data ?? raw;
    if (Array.isArray(payload)) {
      items = payload;
    } else if (payload && Array.isArray(payload.data)) {
      items = payload.data;
    } else if (payload && Array.isArray(payload.content)) {
      items = payload.content;
    }

    // 다음 커서 — 빈 문자열/null 이면 마지막 페이지다.
    const next = raw?.nextToken != null && String(raw.nextToken) !== '' ? String(raw.nextToken) : null;

    console.log(`[CoupangAdapter] getProducts: raw keys=${Object.keys(raw || {}).join(',')}, items=${items.length}, nextToken=${next ?? '(끝)'}`);
    return { items, totalCount: items.length, nextToken: next };
  }

  /**
   * 외부 vendor SKU 로 등록된 상품 조회 — createProduct 타임아웃/5xx 후
   * "쿠팡이 이미 만들었나" 확인해 중복 생성을 방지하는 용도. 없으면 null.
   */
  async findByExternalSku(externalSku: string): Promise<string | null> {
    if (!externalSku) return null;
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/external-vendor-sku-codes/${encodeURIComponent(externalSku)}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await this.coupangApi<any>('GET', path);
      const data = raw?.data ?? raw;
      const list = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : []);
      const first = list?.[0];
      const id = first?.sellerProductId ?? first?.productId;
      return id != null ? String(id) : null;
    } catch {
      return null; // 조회 실패는 등록 흐름을 막지 않음
    }
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

    // 1회 POST — 성공이면 productId, 실패면 쿠팡이 준 code/message 를 그대로 돌려준다.
    //  throw 하지 않는 이유: 브랜드 거절(아래)은 "거절 + 토큰 발급" 이 정상 흐름의 1단계라서
    //  메시지를 읽고 같은 바디로 재요청해야 한다.
    const attempt = async (
      body: Record<string, unknown>,
    ): Promise<{ ok: true; productId: string } | { ok: false; code: string; msg: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await this.coupangApi<any>('POST', path, '', body);

      // 쿠팡 응답 구조: { code: "200", data: { code: "SUCCESS", data: 427011919 } }
      // 또는: { code: "ERROR", message: "...", data: null }
      const outer = raw || {};
      const code = String(outer.code || '');
      const innerData = outer.data;

      if (code === 'ERROR' || (!innerData && innerData !== 0)) {
        // ⚠️ message 는 slice 하지 않는다 — 브랜드 거절의 confirmationToken(250자+)이 끝에 붙는다.
        const msg = String(outer.message || outer.details || JSON.stringify(outer).slice(0, 2000));
        return { ok: false, code, msg };
      }

      // 중첩 응답 처리: data가 객체면 내부 data 추출
      if (typeof innerData === 'object' && innerData !== null && 'data' in innerData) {
        if (innerData.code === 'ERROR') {
          return {
            ok: false,
            code: 'ERROR',
            msg: String(innerData.message || JSON.stringify(innerData).slice(0, 2000)),
          };
        }
        return { ok: true, productId: String(innerData.data) };
      }
      return { ok: true, productId: String(innerData) };
    };

    // 1차 시도. 쿠팡이 HTTP 4xx 로 같은 브랜드 거절을 주는 경우도 있어 throw 도 가로챈다
    //  (그 경로는 apiCall 이 메시지를 잘라 보내므로 토큰이 살아 있을 때만 재요청이 가능하다).
    let res: { ok: true; productId: string } | { ok: false; code: string; msg: string };
    let thrownFirst: unknown;
    try {
      res = await attempt(product);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isBrandIdRequiredError(m)) throw e;
      thrownFirst = e;
      res = { ok: false, code: 'HTTP', msg: m };
    }

    // ---- 브랜드 거절 → GENERIC + confirmationToken 재요청 (쿠팡이 지정한 2단계 플로우) ----
    //  2026-10 쿠팡 정책: brandId 없는 등록을 1차로 거절하고 메시지에 confirmationToken 을 준다.
    //  "브랜드가 없는 상품은 brand 에 GENERIC, confirmationToken 을 body 에 넣어 재요청" — 그대로 따른다.
    //  토큰은 그 요청 1회에만 유효하므로 저장·재사용하지 않는다(매 거절마다 새로 받는다).
    //  brandId 는 지운다 — GENERIC(무브랜드) 과 brandId 를 동시에 보내면 모순이다.
    //  ⚠️ 쿠팡이 "사전 공지 없이 중단될 수 있다" 고 명시한 경로다. 막히면 brandId 확보가 유일한 답.
    if (!res.ok && isBrandIdRequiredError(res.msg)) {
      const token = extractConfirmationToken(res.msg);
      if (!token) {
        console.error('[createProduct] 브랜드 거절인데 confirmationToken 을 못 찾았다 — 재요청 불가:', res.msg.slice(0, 300));
      } else {
        const retryBody: Record<string, unknown> = { ...product, brand: 'GENERIC', confirmationToken: token };
        delete retryBody.brandId;
        console.warn(`[createProduct] 브랜드 거절 → brand=GENERIC + confirmationToken(${token.length}자) 재요청 | 1차 brand=${JSON.stringify(product.brand ?? null)}, brandId=${JSON.stringify(product.brandId ?? null)}`);
        const retried = await attempt(retryBody);
        if (retried.ok) {
          console.log(`[createProduct] ✅ GENERIC 재요청 성공 — sellerProductId=${retried.productId}`);
          return { channelProductId: retried.productId, success: true };
        }
        console.error(`[createProduct] GENERIC 재요청도 거절: ${retried.msg.slice(0, 300)}`);
        res = { ok: false, code: retried.code, msg: `${retried.msg} [GENERIC 재요청 후 — 1차: brandId 요구]` };
      }
      // 1차가 HTTP 에러(throw)였고 재요청으로도 못 살렸으면 원래 에러를 그대로 올린다 — 메시지 형태 보존.
      if (!res.ok && thrownFirst) {
        throw thrownFirst;
      }
    }

    if (!res.ok) {
      const code = res.code;
      const msg = res.msg;
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

    return { channelProductId: res.productId, success: true };
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

  /**
   * 상품 상세 조회 — 실제 쿠팡 상태/판매가/옵션(vendorItem) 확인용
   *  - status: 영문 enum (APPROVED / DENIED / DELETED 등) — 승인 라이프사이클
   *  - statusName: 한글 표시 (승인완료 / 승인반려 / 상품삭제 등)
   *  - items[].vendorItemId: 옵션 단위 판매중지/재개/가격변경에 필요 (쿠팡 판매 on/off는 옵션 단위)
   *  ⚠️ status/statusName 은 "승인 상태"이지 "판매중/중지" 상태가 아니다.
   *     판매 on/off 토글은 vendor-items/{vendorItemId}/sales/stop|resume 로만 제어.
   */
  async getProductDetail(sellerProductId: string): Promise<{
    status: string;
    statusName: string;
    items: { vendorItemId: string; salePrice: number; maximumBuyCount: number }[];
  } | null> {
    try {
      const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await this.coupangApi<any>('GET', path);
      const data = raw?.data ?? raw;
      if (!data) return null;
      return {
        status: String(data.status || '').toUpperCase(),
        statusName: data.statusName || '',
        items: ((data.items || data.sellerProductItemList || []) as { vendorItemId?: number | string; salePrice?: number; maximumBuyCount?: number }[]).map(item => ({
          vendorItemId: item.vendorItemId != null ? String(item.vendorItemId) : '',
          salePrice: item.salePrice ?? 0,
          maximumBuyCount: item.maximumBuyCount ?? 0,
        })),
      };
    } catch (err) {
      console.warn(`[CoupangAdapter] getProductDetail(${sellerProductId}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * 옵션(vendorItem) 실재고·판매상태 — 쿠팡의 진짜 "판매중/품절/판매중지" 신호.
   * ⚠️ seller-products 상세로는 옵션 판매 on/off 를 못 읽는다(승인상태만 나옴).
   *    이 inventories API 만 onSale(판매중 여부) + amountInStock(재고) 을 반환한다.
   *    응답 예: { sellerItemId, amountInStock, salePrice, onSale }
   */
  async getVendorItemInventory(vendorItemId: string): Promise<{ onSale: boolean; amountInStock: number | null; salePrice: number | null } | null> {
    try {
      const path = `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/inventories`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await this.coupangApi<any>('GET', path);
      const d = raw?.data ?? raw;
      if (!d) return null;
      return {
        onSale: !!d.onSale,
        amountInStock: typeof d.amountInStock === 'number' ? d.amountInStock : null,
        salePrice: typeof d.salePrice === 'number' ? d.salePrice : null,
      };
    } catch (err) {
      console.warn(`[CoupangAdapter] getVendorItemInventory(${vendorItemId}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * 상품이 지금 쿠팡에서 실제로 팔리는지 실측(라벨 교정용 진실 소스).
   * 옵션(vendorItem) 중 하나라도 onSale && 재고>0 이면 판매중으로 판정.
   * @param maxOptions 조회할 옵션 수 상한(호출량 제어). 기본 3.
   */
  async getCoupangSaleTruth(sellerProductId: string, maxOptions = 3): Promise<{
    statusName: string;
    sellable: boolean;
    optionsChecked: number;
    firstStock: number | null;
  } | null> {
    const detail = await this.getProductDetail(sellerProductId);
    if (!detail) return null;
    const vids = detail.items.map(i => i.vendorItemId).filter(Boolean).slice(0, maxOptions);
    let sellable = false;
    let firstStock: number | null = null;
    let checked = 0;
    for (const vid of vids) {
      const inv = await this.getVendorItemInventory(vid);
      checked++;
      if (!inv) continue;
      if (checked === 1) firstStock = inv.amountInStock;
      if (inv.onSale && (inv.amountInStock == null || inv.amountInStock > 0)) { sellable = true; break; }
    }
    return { statusName: detail.statusName, sellable, optionsChecked: checked, firstStock };
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

  // ── 옵션(vendorItem) 단위 판매 on/off · 가격 ──
  // 쿠팡 공식 스펙: 판매중지/재개·가격변경은 seller-products 가 아니라 vendor-items 단위다.
  //   판매중지: PUT .../marketplace/vendor-items/{vendorItemId}/sales/stop
  //   판매재개: PUT .../marketplace/vendor-items/{vendorItemId}/sales/resume
  //   가격변경: PUT .../marketplace/vendor-items/{vendorItemId}/prices/{price}
  // (이전 seller-products/{id}/suspend|resume 는 옵션 단위가 아니라 재개가 항상 거부됐음.)

  /** 옵션 1개 판매중지 */
  async stopItemSale(vendorItemId: string) {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/sales/stop`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  /** 옵션 1개 판매재개 */
  async resumeItemSale(vendorItemId: string) {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/sales/resume`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  /** 옵션 1개 판매가 변경 (가격은 path 파라미터) */
  async updateItemPrice(vendorItemId: string, price: number) {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${vendorItemId}/prices/${Math.round(price)}`;
    await this.coupangApi('PUT', path);
    return { success: true };
  }

  /**
   * 여러 옵션 일괄 판매중지/재개. 하나라도 실패하면 사유를 모아 throw (호출측이 로깅).
   * vendorItemIds 가 비어 있으면 getProductDetail 로 조회해서 채운다.
   */
  private async toggleItemsSale(channelProductId: string, action: 'stop' | 'resume', vendorItemIds?: string[]) {
    let ids = (vendorItemIds || []).filter(Boolean);
    if (ids.length === 0) {
      const detail = await this.getProductDetail(channelProductId);
      ids = (detail?.items || []).map(i => i.vendorItemId).filter(Boolean);
    }
    if (ids.length === 0) {
      throw new Error(`vendorItemId 없음 (상품 ${channelProductId}) — 판매상태 변경 불가`);
    }
    const failures: string[] = [];
    for (const vid of ids) {
      try {
        if (action === 'stop') await this.stopItemSale(vid);
        else await this.resumeItemSale(vid);
      } catch (e) {
        failures.push(`${vid}: ${e instanceof Error ? e.message.slice(0, 120) : 'fail'}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${action} 실패 ${failures.length}/${ids.length}개 — ${failures.join(' | ').slice(0, 400)}`);
    }
    return { success: true };
  }

  async suspendProduct(channelProductId: string, vendorItemIds?: string[]) {
    return this.toggleItemsSale(channelProductId, 'stop', vendorItemIds);
  }

  async resumeProduct(channelProductId: string, vendorItemIds?: string[]) {
    return this.toggleItemsSale(channelProductId, 'resume', vendorItemIds);
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

  /** 반품 요청 단건 상세 조회 */
  async getReturnRequestDetail(receiptId: number): Promise<Record<string, unknown>> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/returnRequests/${receiptId}`;
    const data = await this.coupangApi<{ data: Record<string, unknown> }>('GET', path);
    return data.data || {};
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

  /**
   * 온라인(상품) 고객문의 조회 — Wing Open API onlineInquiries
   * 조회 기간은 쿠팡 제약상 최대 7일(호출부에서 창 관리).
   * raw 아이템을 그대로 반환하고, sh_cs_inquiries 매핑은 collect 라우트가 담당.
   */
  async getInquiries(params: { startDate: string; endDate: string; page?: number }) {
    const { startDate, endDate, page = 1 } = params;
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/onlineInquiries`;
    const query = [
      `vendorId=${this.vendorId}`,
      `answeredType=ALL`,
      `inquiryStartAt=${startDate}`,
      `inquiryEndAt=${endDate}`,
      `pageNum=${page}`,
      `pageSize=10`,
    ].join('&');

    const raw = await this.coupangApi<Record<string, unknown>>('GET', path, query);
    // 프록시/직접 모드에 따라 { data: {...} } 또는 {...} 로 올 수 있어 방어적 파싱
    const payload = ((raw?.data ?? raw) || {}) as Record<string, unknown>;
    const content = (payload.content
      ?? (payload.data as Record<string, unknown>)?.content
      ?? []) as Record<string, unknown>[];
    const pagination = payload.pagination as { totalElements?: number } | undefined;
    console.log(`[CoupangAdapter] getInquiries: page=${page}, rawKeys=${Object.keys(raw || {}).join(',')}, items=${content.length}`);
    return { items: content, totalCount: pagination?.totalElements ?? content.length };
  }

  /**
   * 온라인 문의 답변 — 미구현(현재 {success:false} 반환, 화면은 DB에만 저장).
   * 실제 답변 등록 endpoint:
   *   POST /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/onlineInquiries/{inquiryId}/replies
   *   body: { content, vendorId, replyBy }
   * replyBy 는 Wing 로그인 id 인데 channel_credentials(vendorId/accessKey/secretKey)에 없음.
   * 활성화하려면 wingId 를 크레덴셜에 추가해야 함. replyBy 추측 시 4xx 유발하므로 미구현 유지.
   */
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.coupangApi<any>('GET', path, query);

    // 응답 구조 방어적 파싱:
    //  직접 v1 marketplace_openapi: { code, message, content: [...], pagination }
    //  프록시 또는 wrap된 응답: { code, data: { content: [...] } } 또는 { data: [...] }
    let content: Record<string, unknown>[] = [];
    if (Array.isArray(raw?.content)) content = raw.content;
    else if (Array.isArray(raw?.data?.content)) content = raw.data.content;
    else if (Array.isArray(raw?.data)) content = raw.data;
    else if (Array.isArray(raw)) content = raw;

    console.log(`[CoupangAdapter] getOutboundShippingPlaces: rawKeys=${Object.keys(raw || {}).join(',')}, items=${content.length}`);

    return {
      items: content.map((p) => {
        const addresses = (p.placeAddresses as { returnAddress?: string }[] | undefined) || [];
        return {
          outboundShippingPlaceCode: String(p.outboundShippingPlaceCode),
          placeName: (p.shippingPlaceName as string) || '',
          placeAddresses: addresses[0]?.returnAddress || '',
          // 일부 응답은 usable 필드가 누락되거나 문자열일 수 있음 → 명시적 false만 제외
          usable: p.usable !== false,
        };
      }),
    };
  }

  /** 반품지 목록 조회 */
  async getReturnShippingCenters(): Promise<{
    items: { returnCenterCode: string; shippingPlaceName: string; deliverCode: string; returnAddress: string; usable: boolean }[];
  }> {
    const path = `/v2/providers/openapi/apis/api/v5/vendors/${this.vendorId}/returnShippingCenters`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.coupangApi<any>('GET', path);

    // 응답 구조 방어적 파싱: v5 openapi는 { code, data: { content: [...] } } 가 표준이지만
    // 프록시/직접 모드별로 wrap이 달라질 수 있음
    let content: Record<string, unknown>[] = [];
    if (Array.isArray(raw?.data?.content)) content = raw.data.content;
    else if (Array.isArray(raw?.content)) content = raw.content;
    else if (Array.isArray(raw?.data)) content = raw.data;
    else if (Array.isArray(raw)) content = raw;

    console.log(`[CoupangAdapter] getReturnShippingCenters: rawKeys=${Object.keys(raw || {}).join(',')}, items=${content.length}`);

    return {
      items: content.map((c) => {
        const addresses = (c.placeAddresses as { returnAddress?: string }[] | undefined) || [];
        return {
          returnCenterCode: String(c.returnCenterCode),
          shippingPlaceName: (c.shippingPlaceName as string) || '',
          deliverCode: (c.deliverCode as string) || '',
          returnAddress: addresses[0]?.returnAddress || '',
          usable: c.usable !== false,
        };
      }),
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

  /** 카테고리가 제공하는 인증(KC 등) 조회 — grounding 소스.
   *  category-related-metas 응답의 certifications 배열을 파싱한다.
   *
   *  ⚠️ 실측(2026-07-20, 카테고리 63454): 쿠팡은 인증 타입을 MANDATORY 로 선언하지 않는다.
   *     27종 전부 required 가 OPTIONAL|RECOMMEND 였다. 따라서 required 로 거르면 항상 0개가 되고
   *     인증번호가 통째로 누락된다 → 호출부는 required 가 아니라 *이름 매칭* 으로 타입을 고른다.
   *     dataType('CODE'=인증번호를 받는 타입 / 'NONE'=번호 없음)이 그 판단에 필수라 함께 반환한다. */
  async getCategoryCertifications(categoryCode: string): Promise<{
    items: { certificationType: string; name: string; required: boolean; dataType: string }[];
  }> {
    const endpoints = [
      `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${categoryCode}`,
      `/v2/providers/openapi/apis/api/v4/vendors/${this.vendorId}/categorization/meta/display-category-codes/${categoryCode}`,
    ];
    for (const path of endpoints) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await this.coupangApi<any>('GET', path);
        const data = raw?.data || raw;
        // 응답 키 자동 감지 (certifications / certificationList / requiredCertifications)
        const list = data?.certifications || data?.certificationList || data?.requiredCertifications;
        if (Array.isArray(list)) {
          const items = list
            .map((c: Record<string, unknown>) => {
              const certificationType = String(c.certificationType || c.type || c.code || '').trim();
              const requiredRaw = c.required ?? c.mandatory ?? c.necessary;
              const required = requiredRaw === true
                || (typeof requiredRaw === 'string' && /mandatory|required|필수|true|y/i.test(requiredRaw));
              return {
                certificationType,
                name: String(c.name || c.certificationName || c.certificationTypeName || '').trim(),
                required,
                dataType: String(c.dataType || '').trim().toUpperCase(),
              };
            })
            .filter((c: { certificationType: string }) => c.certificationType && c.certificationType !== 'NOT_REQUIRED');
          console.log(`[getCategoryCertifications] ${categoryCode}: ${items.length}개 (code타입=${items.filter((i: {dataType:string}) => i.dataType === 'CODE').length})`);
          return { items };
        }
      } catch (e) {
        console.log(`[getCategoryCertifications] ${path.split('/').slice(-2).join('/')}: 에러=${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}`);
        continue;
      }
    }
    return { items: [] };
  }

  /** 카테고리 메타 원문(category-related-metas) 그대로 반환 — 디버그/인증 shape 확인용 */
  async getRawCategoryMeta(categoryCode: string): Promise<unknown> {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${categoryCode}`;
    return this.coupangApi<unknown>('GET', path);
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

    // 모든 엔드포인트가 attributes 를 못 줌 = 라이브 API 실패(429/5xx/네트워크)일 가능성 높음.
    //   빈 배열을 캐시로 굳히지 않도록 throw → 호출측 getAttributesWithCache 가 미저장 후 다음에 재시도.
    //   (1.6만 백필이 rate limit 으로 false-empty 를 대량 캐싱하던 문제 차단. cat-details 상 전 카테고리가
    //    필수옵션 b 를 가지므로 "진짜 빈" 은 사실상 없음 → 빈 응답 = 실패로 간주가 안전.)
    console.warn(`[getCategoryAttributes] 모든 엔드포인트 attributes 없음(실패로 throw): categoryCode=${categoryCode}`);
    throw new Error(`getCategoryAttributes 실패: category=${categoryCode} (라이브 API 에서 attributes 미수신)`);
  }
}
