/**
 * 테무(Temu) 어댑터 — Temu Open Platform / Local Seller(L2L) 트랙
 *
 * [1단계] 자격증명 연결까지만 구현. 리스팅/주문은 후속 단계.
 *
 * 게이트웨이
 *   US     https://openapi-b-us.temu.com/openapi/router
 *   EU     https://openapi-b-eu.temu.com/openapi/router
 *   GLOBAL https://openapi-b-global.temu.com/openapi/router   ← 한국(그 외 지역) 담당
 *
 *   한국 로컬 셀러는 셀러센터 kr.seller.temu.com, 개발자 콘솔 partner.temu.com(GLOBAL) 트랙이다.
 *   공식 문서에 "Korea → global gateway" 라고 못박은 문구는 없고 리전 분류 규칙으로 도출한 것이라,
 *   첫 연결 테스트가 실패하면 TEMU_API_BASE 로 다른 게이트웨이를 시도해볼 것.
 *
 * 규약
 *   - 전 API 가 단일 라우터에 POST. 메서드명은 URL 이 아니라 body 의 `type` 필드.
 *   - 서명 = MD5(appSecret + 정렬된 key+value 연결 + appSecret) 의 대문자 hex. body 안에 `sign` 으로 넣는다.
 *   - timestamp 는 초 단위이고 서버 시각 ±300초를 벗어나면 거부된다.
 *   - app_key 당 20 QPS.
 *
 * 고정 IP 주의: ISV 앱으로 게시할 때는 요청 출발 IP 를 화이트리스트에 등록해야 하고
 * 중국 클라우드 IP 는 금지다. Vercel 서버리스는 고정 IP 가 없으므로 그 단계에서는
 * 쿠팡이 쓰는 Fly.io 프록시처럼 고정 IP 경유가 필요하다. TEMU_API_BASE 로 우회 지점을 바꿀 수 있다.
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';
import crypto from 'crypto';

const TEMU_API_BASE =
  process.env.TEMU_API_BASE || 'https://openapi-b-global.temu.com/openapi/router';

/** 테무 공통 응답 봉투 */
interface TemuEnvelope<T> {
  success?: boolean;
  errorCode?: number;
  errorMsg?: string;
  result?: T;
}

interface TemuTokenInfo {
  mallId?: number | string;
  mallName?: string;
  expiredTime?: number;
  apiScopeList?: string[];
}

export class TemuAdapter extends BaseAdapter {
  channel: Channel = 'temu';

  private appKey = '';
  private appSecret = '';
  private accessToken = '';

  // capabilities 는 BaseAdapter 기본값(canCreate:false)을 그대로 둔다.
  // 리스팅 매핑(temu.local.goods.v3.add)이 붙기 전까지 자동전파가 이 채널로 상품을 밀지 않도록
  // 막아두는 안전장치다. 리스팅 단계에서 canCreate:true 로 열 것.

  /**
   * 공식 서명 알고리즘 그대로.
   *   1) 공통+비즈니스 파라미터 전부를 key ASCII 오름차순 정렬
   *   2) `key + value` 를 구분자 없이 연결. value 는 공백 없는 JSON 직렬화 후
   *      문자열이면 양끝 따옴표만 제거(내부 이스케이프는 유지 — 실제 전송 body 와 바이트가 같아야 한다)
   *   3) 앞뒤에 appSecret 을 붙여 MD5 → 대문자 hex
   *
   * `sign` 자체는 서명 대상에서 제외한다.
   */
  private sign(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const key of Object.keys(params).sort()) {
      if (key === 'sign') continue;
      const raw = JSON.stringify(params[key]);
      // undefined 는 JSON.stringify 가 undefined 를 반환한다 — 서명에서 제외
      if (raw === undefined) continue;
      parts.push(key + raw.replace(/^"|"$/g, ''));
    }
    const unsigned = this.appSecret + parts.join('') + this.appSecret;
    return crypto.createHash('md5').update(unsigned, 'utf8').digest('hex').toUpperCase();
  }

  /** 라우터 호출 — type + 공통 파라미터 + 서명을 body 에 담아 POST */
  protected async call<T>(type: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.appKey || !this.appSecret) {
      throw new Error('테무 App Key / App Secret 이 없습니다. 채널관리에서 먼저 입력해주세요.');
    }

    const body: Record<string, unknown> = {
      ...params,
      type,
      app_key: this.appKey,
      data_type: 'JSON',
      timestamp: Math.floor(Date.now() / 1000),
    };
    if (this.accessToken) body.access_token = this.accessToken;

    body.sign = this.sign(body);

    const res = await this.apiCall<TemuEnvelope<T>>(TEMU_API_BASE, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // 테무는 HTTP 200 에 errorCode 를 실어 보낸다 — 봉투를 직접 열어야 한다.
    if (res.success === false || (res.errorCode !== undefined && res.errorCode !== 0)) {
      throw new Error(`테무 API 오류 ${res.errorCode ?? '?'}: ${res.errorMsg || '알 수 없는 오류'} (${type})`);
    }
    return res.result as T;
  }

  async authenticate(credentials: Record<string, unknown>): Promise<boolean> {
    this.appKey = String(credentials.appKey || '');
    this.appSecret = String(credentials.appSecret || '');
    this.accessToken = String(credentials.accessToken || '');
    this.credentials = credentials;
    return Boolean(this.appKey && this.appSecret);
  }

  /**
   * 연결 테스트 — 토큰 정보 조회로 키·토큰·서명을 한 번에 검증한다.
   * 성공하면 매장명과 토큰 만료일까지 돌려주므로 "어느 매장에 붙었는지" 즉시 확인된다.
   */
  async testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate(credentials);
      if (!this.appKey || !this.appSecret) {
        return { success: false, message: 'App Key / App Secret 을 모두 입력해주세요.' };
      }
      if (!this.accessToken) {
        return { success: false, message: 'Access Token 이 없습니다. 셀러센터 > 앱 및 서비스 > 앱스토어에서 앱을 승인하고 토큰을 복사해주세요.' };
      }

      const info = await this.call<TemuTokenInfo>('bg.open.accesstoken.info.get');

      const mall = info?.mallName || info?.mallId || '알 수 없음';
      const scopes = info?.apiScopeList?.length ?? 0;
      const expires = info?.expiredTime
        ? new Date(info.expiredTime * 1000).toISOString().slice(0, 10)
        : '미확인';

      return {
        success: true,
        message: `테무 연결 성공 — 매장 ${mall} · 권한 ${scopes}개 · 토큰 만료 ${expires}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      // 자주 나오는 오류에 원인을 붙여준다 (에러코드는 공식 Error SOP 기준)
      let hint = '';
      if (msg.includes('3000001') || msg.includes('7000015')) hint = ' — 서명 불일치. App Secret 을 다시 확인해주세요.';
      else if (msg.includes('7000018') || msg.includes('110020002')) hint = ' — Access Token 이 만료되었거나 무효입니다. 셀러센터에서 재발급해주세요.';
      else if (msg.includes('7000006')) hint = ' — App Key 와 Access Token 이 서로 다른 앱의 것입니다.';
      else if (msg.includes('3000032')) hint = ' — 이 토큰에 해당 API 권한이 없습니다. 앱 승인 시 권한 범위를 확인해주세요.';
      else if (msg.includes('4000004')) hint = ' — 호출 한도(20 QPS) 초과. 잠시 후 재시도해주세요.';
      return { success: false, message: `테무 연결 실패: ${msg}${hint}` };
    }
  }

  // ── 이하 후속 단계 ──
  // 리스팅: temu.local.goods.v3.add / .cats.get / .template.get / .spec.id.get / .publish.status.get
  // 주문:   주문 조회 계열 + bg.logistics.shipment.confirm
  // 지금 호출되면 조용히 빈 값을 돌려주는 대신 명확히 실패하도록 둔다.

  private notYet(what: string): never {
    throw new Error(`테무 ${what} 은 아직 구현되지 않았습니다 (1단계=자격증명 연결까지).`);
  }

  async getProducts(): Promise<{ items: Record<string, unknown>[]; totalCount: number }> { this.notYet('상품 조회'); }
  async createProduct(): Promise<{ channelProductId: string; success: boolean }> { this.notYet('상품 등록'); }
  async updateProduct(): Promise<{ success: boolean }> { this.notYet('상품 수정'); }
  async deleteProduct(): Promise<{ success: boolean }> { this.notYet('상품 삭제'); }
  async updatePrice(): Promise<{ success: boolean }> { this.notYet('가격 수정'); }
  async updateStock(): Promise<{ success: boolean }> { this.notYet('재고 수정'); }
  async suspendProduct(): Promise<{ success: boolean }> { this.notYet('판매 중지'); }
  async resumeProduct(): Promise<{ success: boolean }> { this.notYet('판매 재개'); }

  async getOrders(): Promise<{ items: Record<string, unknown>[]; totalCount: number }> { this.notYet('주문 조회'); }
  async confirmOrder(): Promise<{ success: boolean }> { this.notYet('주문 확인'); }
  async registerInvoice(): Promise<{ success: boolean }> { this.notYet('송장 전송'); }
  async cancelOrder(): Promise<{ success: boolean }> { this.notYet('주문 취소'); }

  async getInquiries(): Promise<{ items: Record<string, unknown>[]; totalCount: number }> { this.notYet('문의 조회'); }
  async answerInquiry(): Promise<{ success: boolean }> { this.notYet('문의 답변'); }

  async getSettlements(): Promise<{ items: Record<string, unknown>[] }> { this.notYet('정산 조회'); }

  async getCategories(): Promise<{ items: { id: string; name: string; parentId?: string }[] }> { this.notYet('카테고리 조회'); }
  async searchCategory(): Promise<{ items: { id: string; name: string; path: string }[] }> { this.notYet('카테고리 검색'); }
}
