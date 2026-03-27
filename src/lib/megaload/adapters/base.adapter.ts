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

  protected async apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 쿠팡 API 에러 응답에서 메시지 추출 시도
      let detail = errorText;
      try {
        const parsed = JSON.parse(errorText);
        detail = parsed.message || parsed.error || parsed.data || errorText;
      } catch { /* JSON이 아니면 원문 사용 */ }
      throw new Error(`API ${response.status}: ${typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500)}`);
    }

    return response.json() as Promise<T>;
  }
}
