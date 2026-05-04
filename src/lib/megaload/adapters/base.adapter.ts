import type { ChannelAdapter, Channel } from '../types';

export abstract class BaseAdapter implements ChannelAdapter {
  abstract channel: Channel;
  protected credentials: Record<string, unknown> = {};

  abstract authenticate(credentials: Record<string, unknown>): Promise<boolean>;
  abstract testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }>;

  abstract getProducts(params: { page?: number; size?: number; status?: string }): Promise<{ items: Record<string, unknown>[]; totalCount: number }>;
  abstract createProduct(product: Record<string, unknown>): Promise<{ channelProductId: string; success: boolean }>;
  abstract updateProduct(channelProductId: string, product: Record<string, unknown>): Promise<{ success: boolean }>;
  abstract deleteProduct(channelProductId: string): Promise<{ success: boolean }>;
  abstract updatePrice(channelProductId: string, price: number): Promise<{ success: boolean }>;
  abstract updateStock(channelProductId: string, stock: number): Promise<{ success: boolean }>;
  abstract suspendProduct(channelProductId: string): Promise<{ success: boolean }>;
  abstract resumeProduct(channelProductId: string): Promise<{ success: boolean }>;

  abstract getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }): Promise<{ items: Record<string, unknown>[]; totalCount: number }>;
  abstract confirmOrder(channelOrderId: string): Promise<{ success: boolean }>;
  abstract registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string): Promise<{ success: boolean }>;
  abstract cancelOrder(channelOrderId: string, reason: string): Promise<{ success: boolean }>;

  abstract getInquiries(params: { startDate: string; endDate: string; page?: number }): Promise<{ items: Record<string, unknown>[]; totalCount: number }>;
  abstract answerInquiry(inquiryId: string, answer: string): Promise<{ success: boolean }>;

  abstract getSettlements(params: { startDate: string; endDate: string }): Promise<{ items: Record<string, unknown>[] }>;

  abstract getCategories(parentId?: string): Promise<{ items: { id: string; name: string; parentId?: string }[] }>;
  abstract searchCategory(keyword: string): Promise<{ items: { id: string; name: string; path: string }[] }>;

  /**
   * apiCall - 기본 타임아웃 65s (proxy 60s 보다 길게 두어 proxy 가 먼저 명시적 502 를 반환하도록 함)
   * 호출지에서 더 짧게 줄이고 싶으면 timeoutMs 인자로 오버라이드.
   * 502 응답에 transient:true 가 있으면 일시적 장애로 분류된 에러 메시지를 던짐 (호출자 retry 활용).
   */
  protected async apiCall<T>(url: string, options: RequestInit = {}, timeoutMs = 65000): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      if (isTimeout) {
        throw new Error(`API 응답 지연 — ${Math.round(timeoutMs / 1000)}초 내 응답 없음 (프록시/네트워크 점검 필요): ${url}`);
      }
      throw new Error(`API 네트워크 오류: ${err instanceof Error ? err.message : String(err)} — ${url}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let detail = errorText;
      let isTransient = false;
      try {
        const parsed = JSON.parse(errorText);
        detail = parsed.message || parsed.error || parsed.data || errorText;
        isTransient = parsed?.transient === true;
      } catch { /* JSON이 아니면 원문 사용 */ }
      // 502 transient → withRetry 가 인식하도록 메시지에 502 포함 + transient 표기
      const tag = isTransient ? '[transient] ' : '';
      throw new Error(`${tag}API ${response.status}: ${typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500)}`);
    }

    return response.json() as Promise<T>;
  }
}
