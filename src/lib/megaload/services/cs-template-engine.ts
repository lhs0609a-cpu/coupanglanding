// ============================================================
// CS 템플릿 엔진 — 변수 치환, 분류, 추천
// ============================================================

import type { CsInquiry, CsTemplate, CsKeywordRule, CsTemplateContext, CsUrgency } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- 변수 치환 ---

/** {{변수명}} 패턴을 컨텍스트 값으로 치환 */
export function renderTemplate(template: string, ctx: CsTemplateContext): string {
  return template.replace(/\{\{(\S+?)\}\}/g, (match, key) => {
    const value = ctx[key as keyof CsTemplateContext];
    return value ?? match; // 값이 없으면 원본 유지
  });
}

/** 템플릿에서 사용된 변수 목록 추출 */
export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\S+?)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// --- 컨텍스트 빌드 ---

/** 문의 + DB 주문정보에서 템플릿 컨텍스트 자동 추출 */
export async function buildContext(
  inquiry: CsInquiry,
  supabase: SupabaseClient
): Promise<CsTemplateContext> {
  const ctx: CsTemplateContext = {
    고객명: inquiry.buyer_name || '고객',
    상품명: inquiry.channel_product_name || '',
    주문번호: inquiry.channel_order_id || '',
  };

  // 주문번호가 있으면 DB에서 추가 정보 조회
  if (inquiry.channel_order_id && inquiry.megaload_user_id) {
    const { data: order } = await supabase
      .from('sh_orders')
      .select('order_status, courier_code, invoice_number, ordered_at, receiver_name')
      .eq('megaload_user_id', inquiry.megaload_user_id)
      .eq('channel_order_id', inquiry.channel_order_id)
      .single();

    if (order) {
      const o = order as Record<string, unknown>;
      ctx.배송상태 = statusToKorean(o.order_status as string);
      ctx.택배사 = o.courier_code as string || '';
      ctx.송장번호 = o.invoice_number as string || '';
      ctx.주문일 = o.ordered_at
        ? new Date(o.ordered_at as string).toLocaleDateString('ko-KR')
        : '';
      if (!ctx.고객명 || ctx.고객명 === '고객') {
        ctx.고객명 = o.receiver_name as string || '고객';
      }
    }
  }

  // 상품명이 없고 order_id가 있으면 order_items에서 가져오기
  if (!ctx.상품명 && inquiry.order_id) {
    const { data: items } = await supabase
      .from('sh_order_items')
      .select('product_name')
      .eq('order_id', inquiry.order_id)
      .limit(1);
    if (items && items.length > 0) {
      ctx.상품명 = (items[0] as Record<string, unknown>).product_name as string;
    }
  }

  return ctx;
}

function statusToKorean(status: string): string {
  const map: Record<string, string> = {
    payment_done: '결제완료',
    order_confirmed: '발주확인',
    shipping_ready: '배송준비중',
    shipping: '배송중',
    delivered: '배송완료',
    cancel_requested: '취소요청',
    cancelled: '취소완료',
    return_requested: '반품요청',
    returned: '반품완료',
    exchange_requested: '교환요청',
    exchanged: '교환완료',
  };
  return map[status] || status || '';
}

// --- 키워드 기반 카테고리 분류 ---

/** 문의 내용으로 카테고리 자동 분류 + 긴급도 판단 */
export function classifyInquiry(
  content: string,
  rules: CsKeywordRule[]
): { categoryId: string; urgency: CsUrgency } | null {
  const normalizedContent = content.toLowerCase();
  let bestMatch: { categoryId: string; score: number } | null = null;

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const matchedKeywords = rule.keywords.filter((kw) =>
      normalizedContent.includes(kw.toLowerCase())
    );

    if (rule.match_mode === 'all') {
      if (matchedKeywords.length === rule.keywords.length) {
        const score = matchedKeywords.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { categoryId: rule.category_id, score };
        }
      }
    } else {
      // 'any' mode
      if (matchedKeywords.length > 0) {
        const score = matchedKeywords.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { categoryId: rule.category_id, score };
        }
      }
    }
  }

  if (!bestMatch) return null;

  // 긴급도 판단
  const urgency = detectUrgency(content);

  return { categoryId: bestMatch.categoryId, urgency };
}

/** 긴급도 키워드 판단 */
function detectUrgency(content: string): CsUrgency {
  const urgentKeywords = ['급해', '빨리', '긴급', '오늘', '즉시', '당장', '지금', '바로'];
  const highKeywords = ['불량', '파손', '깨진', '고장', '하자', '안돼', '작동안'];

  const lower = content.toLowerCase();

  if (urgentKeywords.some((kw) => lower.includes(kw))) return 'urgent';
  if (highKeywords.some((kw) => lower.includes(kw))) return 'high';
  return 'normal';
}

// --- 템플릿 추천 ---

/** 카테고리 + 주문상태 기반 템플릿 추천 (관련도순 정렬) */
export function recommendTemplates(
  categoryId: string | undefined,
  orderStatus: string | undefined,
  templates: CsTemplate[]
): CsTemplate[] {
  if (!categoryId) {
    // 카테고리 미분류 → 인기순 전체 반환
    return [...templates].sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
  }

  // 1순위: 같은 카테고리 + 주문상태 조건 매칭
  // 2순위: 같은 카테고리 + 조건 없음
  // 3순위: 나머지 (인기순)
  const scored = templates.map((t) => {
    let score = 0;
    if (t.category_id === categoryId) {
      score += 100;
      if (t.order_status_condition && orderStatus && t.order_status_condition === orderStatus) {
        score += 50;
      }
      if (!t.order_status_condition) {
        score += 10;
      }
    }
    score += Math.min(t.use_count || 0, 99); // 인기도 가산 (최대 99)
    return { template: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.template);
}

// --- 시간 포맷 ---

/** 상대 시간 포맷 (3분전, 1시간전, 2일전) */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분전`;
  if (diffHr < 24) return `${diffHr}시간전`;
  if (diffDay < 30) return `${diffDay}일전`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}
