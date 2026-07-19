import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 10;

// 세션 셸 하트비트는 30초마다지만, 토큰(인증코드) 방식 도우미의 품절 모니터는 유휴 시
// 2분(CRON_TICK_MS)마다 /auth(verifyToken)로만 신호를 보낸다. 창을 이보다 넉넉히 잡아
// 틱 간격에 배지가 깜빡이지 않게 한다(앱 종료 후 최대 이 시간만큼 "연결됨" 잔상은 감수).
const ONLINE_WINDOW_SEC = 180;

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

    // ⚠️ 배포 순서 안전장치 — app_version·local_endpoint 컬럼은 마이그레이션으로 추가된다.
    //    이 브랜치가 자동배포라 웹이 마이그레이션보다 먼저 나갈 수 있는데, 없는 컬럼을 select 하면
    //    PostgREST 가 에러 → worker-status 전체가 죽어 "연결됨" 배지가 모두 꺼진다.
    //    그래서 확장 컬럼을 먼저 시도하고, 실패하면 기존 컬럼만으로 폴백한다(연결표시는 항상 살아있게).
    type Row = {
      worker_id: string; hostname: string | null; last_seen: string;
      app_version?: string | null;
      local_endpoint?: { port: number; nonce: string } | null;
    };
    const query = (cols: string) => serviceClient
      .from('megaload_worker_heartbeats')
      .select(cols)
      .eq('megaload_user_id', shUserId)
      .gte('last_seen', since)
      .order('last_seen', { ascending: false });

    let rows: Row[];
    const res = await query('worker_id, hostname, last_seen, app_version, local_endpoint');
    if (res.error) {
      // 컬럼 미존재(마이그레이션 전) 등 → 최소 컬럼으로 재시도(연결표시는 항상 살아있게).
      const fb = await query('worker_id, hostname, last_seen');
      rows = (fb.data ?? []) as unknown as Row[];
    } else {
      rows = (res.data ?? []) as unknown as Row[];
    }

    const workers = rows;
    return NextResponse.json({ online: workers.length > 0, workers });
  } catch (err) {
    return NextResponse.json(
      { online: false, workers: [], error: err instanceof Error ? err.message : 'unknown' },
      { status: 200 },
    );
  }
}
