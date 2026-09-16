import { NextResponse } from 'next/server';
import { ACADEMY_STEPS } from '@/lib/data/academy';
import { getAcademyContext, canAccess } from '@/lib/academy/context';
import { runProbe } from '@/lib/academy/verify/runner';
import { touchStreak, readStreak } from '@/lib/academy/streak';

export const maxDuration = 20;
export const dynamic = 'force-dynamic';

/**
 * GET /api/academy/quests
 *
 * 오늘 할 일 — **실제로 밀린 일에서 만든다**(설계도 §8-5).
 * 없는 일을 만들어내지 않는다. 밀린 게 없으면 "오늘은 밀린 일이 없습니다" 라고 말한다.
 * 가짜 할 일을 주는 순간 이 목록 전체가 신뢰를 잃는다.
 */
export async function GET() {
  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  const quests: { key: string; label: string; href: string; xp: number; count?: number }[] = [];

  // ── 다음 단계 ─────────────────────────────────────────────
  const { data: progress } = await ctx.service
    .from('academy_progress').select('step_key, status').eq('user_id', ctx.userId);
  const passed = new Set((progress ?? []).filter((p) => p.status === 'passed').map((p) => p.step_key));
  const nextStep = ACADEMY_STEPS.find((s) => canAccess(s, ctx) && !passed.has(s.key));
  if (nextStep) {
    quests.push({
      key: `step:${nextStep.key}`,
      label: `다음 단계 — ${nextStep.title}`,
      href: `/my/academy/${nextStep.key}`,
      xp: nextStep.xp,
    });
  }

  // ── 실제 밀린 일 ──────────────────────────────────────────
  // 쿠팡 계정이 없으면 물어볼 곳이 없다. 그때는 단계 퀘스트만 준다.
  let unshipped = 0;
  let unanswered = 0;
  let activity = 0;
  let checked = false;

  if (ctx.megaloadUserId) {
    const [orders, inquiries] = await Promise.all([
      runProbe({ service: ctx.service, megaloadUserId: ctx.megaloadUserId }, 'coupang.orders', { days: 7 }),
      runProbe({ service: ctx.service, megaloadUserId: ctx.megaloadUserId }, 'coupang.inquiries', { days: 7 }),
    ]);

    if (orders.ok) {
      const by = (orders.data.byStatus || {}) as Record<string, number>;
      // ACCEPT(결제완료) · INSTRUCT(발주확인) = 아직 안 나간 주문
      unshipped = Number(by.ACCEPT || 0) + Number(by.INSTRUCT || 0);
      activity += Number(orders.data.count || 0);
      checked = true;
    }
    if (inquiries.ok) {
      unanswered = Number(inquiries.data.unanswered || 0);
      activity += Number(inquiries.data.count || 0);
      checked = true;
    }

    if (unshipped > 0) {
      quests.push({
        key: 'orders:ship',
        label: `송장 등록이 필요한 주문 ${unshipped}건`,
        href: '/megaload/orders',
        xp: 30,
        count: unshipped,
      });
    }
    if (unanswered > 0) {
      quests.push({
        key: 'cs:answer',
        label: `미답변 문의 ${unanswered}건`,
        href: '/megaload/cs',
        xp: 20,
        count: unanswered,
      });
    }
  }

  // ── 스트릭 ────────────────────────────────────────────────
  // 밀린 일을 0으로 **유지**하고 있고, 최근에 실제 활동이 있었으면 오늘을 채운다.
  // 주문도 문의도 없는 사람은 가만히 있어도 0이라 그때는 채우지 않는다.
  const cleared = checked && unshipped === 0 && unanswered === 0 && activity > 0;
  const streak = cleared
    ? (await touchStreak(ctx.service, ctx.userId)) ?? (await readStreak(ctx.service, ctx.userId))
    : await readStreak(ctx.service, ctx.userId);

  return NextResponse.json({
    quests,
    cleared,
    checkedCoupang: checked,
    streak,
  });
}
