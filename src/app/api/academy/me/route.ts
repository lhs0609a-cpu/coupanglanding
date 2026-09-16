import { NextResponse } from 'next/server';
import { ACADEMY_STEPS, toPublic, ACT_META, TOTAL_ACADEMY_XP } from '@/lib/data/academy';
import { getAcademyContext, canAccess, levelFromXp } from '@/lib/academy/context';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';

/**
 * GET /api/academy/me
 * 아카데미 전체 트리 + 내 진행 + XP/레벨/뱃지. 화면이 한 번만 부르면 되게 한 콜로 준다.
 *
 * ★ pass() 와 퀴즈 정답은 나가지 않는다(toPublic). 나가면 판정이 무의미해진다.
 */
export async function GET() {
  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  const [{ data: progress }, { data: ledger }, { data: badges }] = await Promise.all([
    ctx.service.from('academy_progress')
      .select('step_key, status, attempts, passed_at, verify_payload')
      .eq('user_id', ctx.userId),
    ctx.service.from('academy_xp_ledger').select('amount').eq('user_id', ctx.userId),
    ctx.service.from('academy_badges').select('badge_key, awarded_at').eq('user_id', ctx.userId),
  ]);

  const xp = (ledger ?? []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const passedKeys = new Set((progress ?? []).filter((p) => p.status === 'passed').map((p) => p.step_key));

  const steps = ACADEMY_STEPS.map((step) => {
    const locked = !canAccess(step, ctx);
    return {
      ...toPublic(step),
      locked,
      // 잠금 사유는 벌이 아니라 안내다 — "왜 안 열리는지" 를 말해준다
      lockReason: locked ? 'PT 학생에게 열리는 단계입니다.' : null,
      progress: (progress ?? []).find((p) => p.step_key === step.key) ?? null,
    };
  });

  return NextResponse.json({
    acts: Object.entries(ACT_META).map(([act, meta]) => ({ act: Number(act), ...meta })),
    steps,
    stats: {
      xp,
      totalXp: TOTAL_ACADEMY_XP,
      passedCount: passedKeys.size,
      totalSteps: ACADEMY_STEPS.length,
      ...levelFromXp(xp),
    },
    badges: badges ?? [],
    isPtStudent: ctx.isPtStudent,
    hasMegaloadAccount: !!ctx.megaloadUserId,
  });
}
