import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { checkpointAutoJob, getAutoJob } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

interface Body {
  processedDelta: number;
  successDelta: number;
  failedDelta: number;
  lastIdx: number;
}

/**
 * POST /api/megaload/auto-job/[id]/checkpoint
 * 배치 N개 완료 후 진행 상태 영속화. 탭 닫혀도 resume 가능하게 만드는 핵심 엔드포인트.
 */
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
    if (
      !Number.isFinite(body.processedDelta) ||
      !Number.isFinite(body.successDelta) ||
      !Number.isFinite(body.failedDelta) ||
      !Number.isInteger(body.lastIdx)
    ) {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 });
    }

    await checkpointAutoJob(serviceClient, id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '체크포인트 실패' },
      { status: 500 },
    );
  }
}
