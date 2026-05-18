import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { resumeAutoJob, getAutoJob } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

/** POST /api/megaload/auto-job/[id]/resume — 일시정지된 잡을 'registering' 으로 복귀 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const job = await getAutoJob(serviceClient, id, shUserId);
    if (!job) return NextResponse.json({ error: '잡을 찾을 수 없습니다' }, { status: 404 });
    if (job.status !== 'paused') {
      return NextResponse.json({ error: `${job.status} 상태는 resume 불가` }, { status: 409 });
    }

    const updated = await resumeAutoJob(serviceClient, id);
    return NextResponse.json({ job: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'resume 실패' },
      { status: 500 },
    );
  }
}
