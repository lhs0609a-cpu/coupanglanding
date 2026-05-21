import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 10;

const ONLINE_WINDOW_SEC = 90;

/**
 * GET /api/megaload/products/thumbnail-jobs/worker-status
 * 최근 90초 내 하트비트 기준 로컬 GPU 워커 연결 여부.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ online: false, workers: [] });
    }

    const since = new Date(Date.now() - ONLINE_WINDOW_SEC * 1000).toISOString();
    const { data: rows } = await serviceClient
      .from('megaload_worker_heartbeats')
      .select('worker_id, hostname, last_seen')
      .eq('megaload_user_id', shUserId)
      .gte('last_seen', since)
      .order('last_seen', { ascending: false });

    const workers = (rows ?? []) as { worker_id: string; hostname: string | null; last_seen: string }[];
    return NextResponse.json({ online: workers.length > 0, workers });
  } catch (err) {
    return NextResponse.json(
      { online: false, workers: [], error: err instanceof Error ? err.message : 'unknown' },
      { status: 200 },
    );
  }
}
