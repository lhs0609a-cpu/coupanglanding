import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { confirmGate1, getAutoJob } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

/**
 * POST /api/megaload/auto-job/[id]/confirm
 * Gate 1 사용자 확인 → 잡을 'scanning' 으로 전환.
 */
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
    if (job.status !== 'pending') {
      return NextResponse.json({ error: `이미 ${job.status} 상태입니다` }, { status: 409 });
    }

    await confirmGate1(serviceClient, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '확인 실패' },
      { status: 500 },
    );
  }
}
