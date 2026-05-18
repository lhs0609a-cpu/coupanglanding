import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getResumableJob } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 10;

/**
 * GET /api/megaload/auto-job/resumable
 * 사용자의 미완료 자동등록 잡을 1개 반환 (있으면).
 * 브라우저 첫 진입 시 "전 작업 이어서 진행할까요?" UI 노출용.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    const job = await getResumableJob(serviceClient, shUserId);
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 },
    );
  }
}
