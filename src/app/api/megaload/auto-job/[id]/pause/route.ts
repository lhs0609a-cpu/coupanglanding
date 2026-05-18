import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { pauseAutoJob, getAutoJob, type AutoJobPauseReason } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

interface Body {
  reason: AutoJobPauseReason;
  detail?: Record<string, unknown>;
}

/** POST /api/megaload/auto-job/[id]/pause — Gate 2 자동 일시정지 또는 사용자 수동 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const job = await getAutoJob(serviceClient, id, shUserId);
    if (!job) return NextResponse.json({ error: '잡을 찾을 수 없습니다' }, { status: 404 });

    const body = (await req.json()) as Body;
    if (!body.reason) return NextResponse.json({ error: 'reason 필요' }, { status: 400 });

    await pauseAutoJob(serviceClient, id, body.reason, body.detail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '일시정지 실패' },
      { status: 500 },
    );
  }
}
