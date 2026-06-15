import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300;
const ABS_DEADLINE_MS = 250_000;
const REVERIFY_LOOP_MAX = 30; // reverify-reset 콜 최대 (각 콜당 최대 40쿠폰)

/**
 * GET /api/cron/coupon-reverify  (방법 A 드라이브)
 * 매시 23·53분 — download_reverified_at 이 비어있는 유저 1명을 골라,
 * NOT_FOUND(가짜 success) 다운로드 쿠폰의 상품을 pending 으로 되돌린다(reverify-reset 반복).
 * 완료하면 download_reverified_at 갱신 → 다시 안 돎. 모든 유저 처리되면 자연 종료(idle).
 * 되돌려진 pending 상품은 coupon-auto-apply 크론(pending-finish)이 재적용한다.
 */
export async function GET(request: Request) {
  const tickStart = Date.now();
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sc = await createServiceClient();

  // 아직 재검증 안 한 유저 1명 (config 활성)
  const { data: candidates } = await sc
    .from('coupon_auto_sync_config')
    .select('pt_user_id')
    .eq('is_enabled', true)
    .is('download_reverified_at', null)
    .limit(1);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'no users pending reverify' });
  }

  const ptUserId = (candidates[0] as { pt_user_id: string }).pt_user_id;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || `https://www.megaload.co.kr`;
  const cronAuth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

  const summary: Record<string, unknown> = {
    pt_user_id: ptUserId,
    calls: 0,
    verified: 0,
    notFound: 0,
    resetItems: 0,
    error: null as string | null,
  };

  try {
    // 커서를 호출 간 전달 → 호출마다 과거 쿠폰 40개로 전진 (835개도 한 틱에 완주).
    let cursor: string | null = null;
    for (let i = 0; i < REVERIFY_LOOP_MAX; i++) {
      if (Date.now() - tickStart > ABS_DEADLINE_MS) break;
      const qs = `ptUserId=${encodeURIComponent(ptUserId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetch(`${baseUrl}/api/promotion/reverify-reset?${qs}`, {
        method: 'POST',
        headers: { ...cronAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      summary.calls = (summary.calls as number) + 1;
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`reverify-reset HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json() as { verified?: number; notFound?: number; resetItems?: number; hasMore?: boolean; nextCursor?: string | null };
      summary.verified = (summary.verified as number) + (data.verified || 0);
      summary.notFound = (summary.notFound as number) + (data.notFound || 0);
      summary.resetItems = (summary.resetItems as number) + (data.resetItems || 0);
      if (!data.hasMore || !data.nextCursor) break;
      cursor = data.nextCursor;
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    void logSystemError({ source: 'cron/coupon-reverify', error: err, context: { ptUserId } }).catch(() => {});
  }

  // 완료 마킹 — ★ 에러 없이 완주한 경우에만.
  //   (예전 버그: 에러여도 마킹 → API 한 번 삐끗으로 그 유저는 영구 재검증 제외 →
  //    STANDBY/가짜 쿠폰이 영영 복구 안 됨. 이제 에러면 마킹 안 해 다음 사이클에 재시도.)
  //   reverify-reset 내부는 일시 오류를 per-coupon skip 하므로, summary.error 는
  //   reverify-reset 자체가 HTTP 실패(인증/네트워크)한 하드에러일 때만 set 된다.
  if (summary.error == null) {
    await sc
      .from('coupon_auto_sync_config')
      .update({ download_reverified_at: new Date().toISOString() })
      .eq('pt_user_id', ptUserId);
  }

  summary.elapsed_ms = Date.now() - tickStart;
  return NextResponse.json({ processed: 1, summary });
}
