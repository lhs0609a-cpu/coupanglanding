/**
 * 판정 프로브 — 아카데미 스텝이 "실제로 됐는지" 확인하는 조회들.
 *
 * ★ 철칙 두 가지
 *   1) **읽기 전용.** 판정이 사용자의 쿠팡 계정을 바꾸는 일은 절대 없다.
 *      판정하러 갔다가 상품을 지우거나 주문을 확정하면 그건 재앙이다.
 *   2) **실패해도 던지지 않는다.** { ok:false, error } 로 돌려준다.
 *      프로브가 터져서 500 이 나면 사용자는 "내가 뭘 잘못했나" 를 영영 모른다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import type { ProbeKey, ProbeResult } from '@/lib/data/academy/types';

export interface ProbeContext {
  service: SupabaseClient;
  megaloadUserId: string;
}

type Probe = (ctx: ProbeContext, params?: Record<string, unknown>) => Promise<ProbeResult>;

/** 저장된 쿠팡 자격증명. 없으면 null — "키가 없다" 와 "쿠팡이 거부한다" 는 다른 문제다. */
async function coupangCreds(ctx: ProbeContext): Promise<Record<string, unknown> | null> {
  const { data } = await ctx.service
    .from('channel_credentials')
    .select('credentials')
    .eq('megaload_user_id', ctx.megaloadUserId)
    .eq('channel', 'coupang')
    .eq('is_connected', true)
    .maybeSingle();
  return (data?.credentials as Record<string, unknown>) || null;
}

/**
 * 쿠팡 어댑터.
 * factory 의 getAuthenticatedAdapter 는 BaseAdapter 로 좁혀져서 배송지·반품요청 같은
 * 쿠팡 전용 메서드가 안 보인다. 판정에는 그것들이 필요하므로 여기서는 구체 타입을 쓴다.
 */
async function coupang(ctx: ProbeContext): Promise<CoupangAdapter> {
  const creds = await coupangCreds(ctx);
  if (!creds) {
    throw new Error('쿠팡 API 키가 등록되지 않았습니다. 채널관리에서 먼저 연동해주세요.');
  }
  const adapter = new CoupangAdapter();
  await adapter.authenticate(creds);
  return adapter;
}

function fail(error: string): ProbeResult {
  return { ok: false, data: {}, error };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : '알 수 없는 오류';
}

/** 조회 기간 — 기본 최근 30일. 첫 주문·첫 문의 판정에 쓴다. */
function dateRange(params?: Record<string, unknown>) {
  const days = Number(params?.days ?? 30);
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export const PROBES: Record<ProbeKey, Probe> = {
  // ── API 연동됐나 ─────────────────────────────────────────
  // testConnection 은 어댑터가 아니라 **자격증명**을 받는다. 키가 아예 없는 경우와
  // 키는 있는데 쿠팡이 거부하는 경우를 구분해서 말해줘야 한다 — 고쳐야 할 게 다르다.
  'coupang.connection': async (ctx) => {
    try {
      const creds = await coupangCreds(ctx);
      if (!creds) {
        return {
          ok: true,
          data: { connected: false, message: '아직 쿠팡 API 키가 등록되지 않았습니다. 채널관리에서 세 값을 입력해주세요.' },
        };
      }
      const r = await new CoupangAdapter().testConnection(creds);
      return { ok: true, data: { connected: r.success, message: r.message } };
    } catch (e) {
      return fail(`연결 확인 중 오류가 났습니다: ${msg(e)}`);
    }
  },

  // ── 출고지·반품지 등록됐나 ────────────────────────────────
  'coupang.shippingPlaces': async (ctx) => {
    try {
      const adapter = await coupang(ctx);
      const [out, ret] = await Promise.all([
        adapter.getOutboundShippingPlaces(),
        adapter.getReturnShippingCenters(),
      ]);
      return {
        ok: true,
        data: {
          outboundCount: out.items.filter((i) => i.usable).length,
          returnCount: ret.items.filter((i) => i.usable).length,
        },
      };
    } catch (e) {
      return fail(msg(e));
    }
  },

  // ── 상품 몇 개 올렸나 / 승인됐나 ──────────────────────────
  'coupang.products': async (ctx, params) => {
    try {
      const adapter = await coupang(ctx);
      const size = 100;
      const r = await adapter.getProducts({ page: 1, size, status: params?.status as string | undefined });
      return {
        ok: true,
        data: {
          count: r.items.length,
          // 한 페이지를 꽉 채웠으면 더 있다는 뜻 — "100건" 이라고 단정하지 않는다
          atLeast: r.items.length >= size,
        },
      };
    } catch (e) {
      return fail(msg(e));
    }
  },

  // ── 주문 들어왔나 / 처리됐나 ─────────────────────────────
  'coupang.orders': async (ctx, params) => {
    try {
      const adapter = await coupang(ctx);
      const r = await adapter.getOrders({ ...dateRange(params), status: params?.status as string | undefined });
      return { ok: true, data: { count: r.items.length } };
    } catch (e) {
      return fail(msg(e));
    }
  },

  // ── 고객문의 / 답변했나 ──────────────────────────────────
  'coupang.inquiries': async (ctx, params) => {
    try {
      const adapter = await coupang(ctx);
      const r = await adapter.getInquiries(dateRange(params));
      const items = r.items as Record<string, unknown>[];
      const answered = items.filter((i) => {
        const a = i.answers ?? i.answerList;
        return Array.isArray(a) && a.length > 0;
      }).length;
      return { ok: true, data: { count: items.length, answered, unanswered: items.length - answered } };
    } catch (e) {
      return fail(msg(e));
    }
  },

  // ── 반품 접수 / 처리했나 ─────────────────────────────────
  'coupang.returns': async (ctx, params) => {
    try {
      const adapter = await coupang(ctx);
      const { startDate, endDate } = dateRange(params);
      // 반품 API 만 파라미터 이름이 다르다 (createdAtFrom/To).
      const r = await adapter.getReturnRequests({
        createdAtFrom: startDate,
        createdAtTo: endDate,
        status: params?.status as 'RU' | 'UC' | 'CC' | 'PR' | undefined,
      });
      return { ok: true, data: { count: r.items.length } };
    } catch (e) {
      return fail(msg(e));
    }
  },

  // ── 정산 났나 ────────────────────────────────────────────
  'coupang.settlements': async (ctx, params) => {
    try {
      const adapter = await coupang(ctx);
      const r = await adapter.getSettlements(dateRange(params));
      return { ok: true, data: { count: r.items.length } };
    } catch (e) {
      return fail(msg(e));
    }
  },

  // ── 우리 DB 기준 등록 상품 수 ────────────────────────────
  // 쿠팡 API 를 아끼고 싶을 때, 그리고 "메가로드로 올린 것" 만 세고 싶을 때.
  'db.productCount': async (ctx) => {
    try {
      const { count, error } = await ctx.service
        .from('sh_products')
        .select('id', { count: 'exact', head: true })
        .eq('megaload_user_id', ctx.megaloadUserId);
      if (error) return fail(error.message);
      return { ok: true, data: { count: count ?? 0 } };
    } catch (e) {
      return fail(msg(e));
    }
  },
};
