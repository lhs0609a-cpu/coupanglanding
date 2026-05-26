import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 15;

/**
 * GET /api/megaload/products/llm-jobs?batchId=...
 * 본인 LLM 잡 진행 현황 — 상태별 카운트 + (batchId 지정 시) 해당 배치 행 목록(결과 포함).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' },
        { status: 404 },
      );
    }

    const batchId = req.nextUrl.searchParams.get('batchId');

    let q = serviceClient
      .from('megaload_llm_jobs')
      .select('status')
      .eq('megaload_user_id', shUserId);
    if (batchId) q = q.eq('batch_id', batchId);
    const { data: statusRows, error: statusErr } = await q;
    if (statusErr) {
      return NextResponse.json({ error: statusErr.message }, { status: 500 });
    }

    const counts: Record<string, number> = { pending: 0, processing: 0, done: 0, error: 0, canceled: 0 };
    for (const r of (statusRows ?? []) as { status: string }[]) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }

    let jobs: unknown[] | undefined;
    if (batchId) {
      const { data: rows } = await serviceClient
        .from('megaload_llm_jobs')
        .select('id, label, task_type, status, result, error_message, completed_at')
        .eq('megaload_user_id', shUserId)
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });
      jobs = rows ?? [];
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ total, counts, jobs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 },
    );
  }
}
