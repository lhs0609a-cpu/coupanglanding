import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAutoJob } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

/** GET /api/megaload/auto-job/[id] — 잡 상태 조회 (소유권 체크) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const job = await getAutoJob(serviceClient, id, shUserId);
    if (!job) return NextResponse.json({ error: '잡을 찾을 수 없습니다' }, { status: 404 });

    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 },
    );
  }
}
