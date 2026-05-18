import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { finalizeAutoJob, getAutoJob } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

interface Body {
  finalStatus: 'completed' | 'aborted' | 'failed';
  resultSummary?: Record<string, unknown>;
}

/** POST /api/megaload/auto-job/[id]/finalize — 잡 종료 (completed/aborted/failed) */
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
    if (!['completed', 'aborted', 'failed'].includes(body.finalStatus)) {
      return NextResponse.json({ error: 'invalid finalStatus' }, { status: 400 });
    }

    await finalizeAutoJob(serviceClient, id, body.finalStatus, body.resultSummary);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'finalize 실패' },
      { status: 500 },
    );
  }
}
