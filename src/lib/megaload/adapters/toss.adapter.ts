/**
 * 토스쇼핑 스텁 어댑터 — 공식 셀러 API 미공개 상태
 *
 * 토스페이는 결제 서비스, 토스쇼핑은 제휴사 상품 노출 중개 (딥링크 기반).
 * 일반 셀러용 공식 Open API가 공개되면 이 파일을 실제 구현으로 교체.
 *
 * 현재는 createProduct/updateProduct 등 모든 쓰기 작업이 "준비 중" 에러를 반환.
 */
import { BaseAdapter } from './base.adapter';
import type { Channel } from '../types';

const STUB_ERROR = '토스쇼핑 셀러 API는 현재 준비 중입니다. 공식 공개 후 자동 활성화됩니다.';

export class TossAdapter extends BaseAdapter {
  channel: Channel = 'toss';

  async authenticate(): Promise<boolean> { return false; }
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: STUB_ERROR };
  }

  async getProducts() { return { items: [], totalCount: 0 }; }
  async createProduct(): Promise<{ channelProductId: string; success: boolean }> { throw new Error(STUB_ERROR); }
  async updateProduct(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async deleteProduct(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async updatePrice(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async updateStock(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async suspendProduct(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async resumeProduct(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }

  async getOrders() { return { items: [], totalCount: 0 }; }
  async confirmOrder(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async registerInvoice(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }
  async cancelOrder(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }

  async getInquiries() { return { items: [], totalCount: 0 }; }
  async answerInquiry(): Promise<{ success: boolean }> { throw new Error(STUB_ERROR); }

  async getSettlements() { return { items: [] }; }

  async getCategories() { return { items: [] }; }
  async searchCategory() { return { items: [] }; }
}
