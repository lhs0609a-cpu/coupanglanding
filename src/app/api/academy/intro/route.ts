import { NextResponse } from 'next/server';
import { getAcademyContext } from '@/lib/academy/context';
import { ACADEMY_STEPS } from '@/lib/data/academy';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

/**
 * 아카데미 첫 진입 안내.
 *
 * 대시보드가 이걸 물어보고, 아직 안 본 사람은 아카데미로 보낸다.
 * ★ 가볍게 유지한다 — 로그인한 모든 사람이 대시보드에서 한 번씩 부른다.
 *   스텝 33개짜리 /me 를 부르게 하면 안 된다.
 */
export async function GET() {
  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  const [{ data: streak }, { count }, { data: profile }] = await Promise.all([
    ctx.service.from('academy_streaks').select('intro_seen_at').eq('user_id', ctx.userId).maybeSingle(),
    ctx.service.from('academy_progress').select('id', { count: 'exact', head: true }).eq('user_id', ctx.userId),
    ctx.service.from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle(),
  ]);

  const firstStep = ACADEMY_STEPS[0];

  return NextResponse.json({
    seen: !!streak?.intro_seen_at,
    hasProgress: (count ?? 0) > 0,
    name: (profile?.full_name as string) || '',
    firstStepKey: firstStep?.key ?? null,
    totalSteps: ACADEMY_STEPS.length,
  });
}

/** 환영 화면을 봤다고 기록. 시작하든 나중에 하든 한 번 보면 다시 낚아채지 않는다. */
export async function POST() {
  const res = await getAcademyContext();
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { ctx } = res;

  await ctx.service.from('academy_streaks').upsert(
    { user_id: ctx.userId, intro_seen_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  return NextResponse.json({ ok: true });
}
