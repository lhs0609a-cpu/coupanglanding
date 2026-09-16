import { NextRequest, NextResponse } from 'next/server';
import { getStep } from '@/lib/data/academy';
import { getAcademyContext, canAccess } from '@/lib/academy/context';
import { verifyStep } from '@/lib/academy/verify/runner';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * POST /api/academy/steps/[key]/verify
 * "다 했나요?" 버튼이 부르는 곳. 시스템이 직접 쿠팡에 물어보고 판정한다.
 *
 * ★ 실패 응답에도 반드시 `detail` 이 들어간다 — 판정 근거를 말하지 않으면
 *   사람은 거기서 막힌다. "0건으로 조회됩니다" 라야 다음 행동을 스스로 찾는다.
 */
export async function POST(request: NextRequest, routeCtx: { params: Promise<{ key: string }> }) {
  const { key } = await routeCtx.params;

  const step = getStep(key);
  if (!step) return NextResponse.json({ error: '없는 스텝입니다.' }, { status: 404 });

  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  if (!canAccess(step, ctx)) {
    return NextResponse.json({ error: 'PT 학생에게 열리는 단계입니다.' }, { status: 403 });
  }

  // L1 은 쿠팡 계정이 있어야 판정할 수 있다. 없으면 "실패" 가 아니라 "먼저 할 일" 을 알려준다.
  if (step.verify.level === 1 && !ctx.megaloadUserId) {
    return NextResponse.json({
      passed: false,
      detail: '메가로드 계정이 없어 쿠팡에 물어볼 수 없습니다. 먼저 채널 연동을 진행해주세요.',
      attempts: 0,
      canRequestReview: false,
      xpAwarded: 0,
    });
  }

  let answers: number[] | undefined;
  if (step.verify.level === 3) {
    try {
      const body = await request.json();
      if (Array.isArray(body?.answers)) answers = body.answers.map(Number);
    } catch { /* 아래 채점에서 "모두 답해주세요" 로 걸린다 */ }
  }

  const outcome = await verifyStep({
    service: ctx.service,
    userId: ctx.userId,
    megaloadUserId: ctx.megaloadUserId ?? '',
    stepKey: key,
    answers,
  });

  return NextResponse.json(outcome);
}
