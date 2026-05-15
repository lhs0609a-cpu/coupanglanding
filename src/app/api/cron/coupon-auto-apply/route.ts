import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300; // 5분 — 한 사용자의 collect + 여러 bulk-apply 콜 처리

const ABS_DEADLINE_MS = 250_000; // 안전 마진 (Vercel 5분 한도 - 50초)
const COLLECT_LOOP_MAX = 30;     // collect-products 페이징 콜 최대
const APPLY_LOOP_MAX = 50;       // bulk-apply 콜 최대 (각 콜당 ~50건 처리)

/**
 * GET /api/cron/coupon-auto-apply
 * 15분마다 실행 — auto_apply_enabled 사용자 1명을 골라 cycle_days 만료 시 쿠폰 자동 적용.
 *
 * 동작:
 *   1. 가장 오래 미실행된 적격 사용자 1명 lock-pick
 *   2. /api/promotion/collect-products 반복 호출 (신규 상품 수집, hasMore=false까지)
 *   3. /api/promotion/bulk-apply 반복 호출 (즉시할인 + 다운로드 적용)
 *   4. 완료/실패 상관없이 last_auto_apply_at 갱신 → 다음 사이클까지 제외
 *      (실패는 last_auto_apply_summary.error에 기록, 다음 사이클에 자동 재시도)
 */
export async function GET(request: Request) {
  const tickStart = Date.now();
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sc = await createServiceClient();

  // ── 1) 적격 사용자 1명 선택 (가장 오래 미실행 우선) ──
  const { data: candidates } = await sc
    .from('coupon_auto_sync_config')
    .select('id, pt_user_id, auto_apply_cycle_days, last_auto_apply_at, instant_coupon_enabled, download_coupon_enabled')
    .eq('auto_apply_enabled', true)
    .eq('is_enabled', true)
    .order('last_auto_apply_at', { ascending: true, nullsFirst: true })
    .limit(20);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'no auto_apply users' });
  }

  // 클라이언트 측 cycle 필터링 (DB에서 동적 interval 비교 어려움)
  const now = Date.now();
  const eligible = candidates.find((c) => {
    const cfg = c as { last_auto_apply_at: string | null; auto_apply_cycle_days: number; instant_coupon_enabled: boolean; download_coupon_enabled: boolean };
    if (!cfg.instant_coupon_enabled && !cfg.download_coupon_enabled) return false;
    if (!cfg.last_auto_apply_at) return true; // 한 번도 안 돌린 사용자
    const elapsedDays = (now - new Date(cfg.last_auto_apply_at).getTime()) / (1000 * 60 * 60 * 24);
    return elapsedDays >= (cfg.auto_apply_cycle_days || 5);
  });

  if (!eligible) {
    return NextResponse.json({ processed: 0, reason: 'no eligible users this tick' });
  }

  const cfg = eligible as { id: string; pt_user_id: string };
  const ptUserId = cfg.pt_user_id;

  // ── 2) base URL 결정 (Vercel은 VERCEL_URL 제공) ──
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || `https://www.megaload.co.kr`;

  const cronAuth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  const summary: Record<string, unknown> = {
    pt_user_id: ptUserId,
    started_at: new Date().toISOString(),
    collect_calls: 0,
    apply_calls: 0,
    error: null as string | null,
  };

  try {
    // ── 3) collect-products 반복 (신규 상품 수집) ──
    let nextToken = '';
    for (let i = 0; i < COLLECT_LOOP_MAX; i++) {
      if (Date.now() - tickStart > ABS_DEADLINE_MS) break;
      const url = `${baseUrl}/api/promotion/collect-products?ptUserId=${encodeURIComponent(ptUserId)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...cronAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextToken, collectDays: 0 }),
      });
      summary.collect_calls = (summary.collect_calls as number) + 1;
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`collect-products HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json() as { hasMore?: boolean; nextToken?: string; collected?: boolean };
      if (data.collected || !data.hasMore) break;
      nextToken = data.nextToken || '';
      if (!nextToken) break;
    }

    // ── 4) bulk-apply 반복 (hasMore=false까지) ──
    for (let i = 0; i < APPLY_LOOP_MAX; i++) {
      if (Date.now() - tickStart > ABS_DEADLINE_MS) break;
      const url = `${baseUrl}/api/promotion/bulk-apply?ptUserId=${encodeURIComponent(ptUserId)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...cronAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      summary.apply_calls = (summary.apply_calls as number) + 1;
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`bulk-apply HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json() as { hasMore?: boolean; lastError?: string };
      if (data.lastError) summary.last_error = data.lastError;
      if (!data.hasMore) break;
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    void logSystemError({ source: 'cron/coupon-auto-apply', error: err, context: { ptUserId } }).catch(() => {});
  }

  summary.finished_at = new Date().toISOString();
  summary.elapsed_ms = Date.now() - tickStart;

  // ── 5) last_auto_apply_at 갱신 (실패해도 갱신 — 다음 사이클에 재시도, 폭주 방지) ──
  await sc
    .from('coupon_auto_sync_config')
    .update({
      last_auto_apply_at: new Date().toISOString(),
      last_auto_apply_summary: summary,
    })
    .eq('pt_user_id', ptUserId);

  return NextResponse.json({
    processed: 1,
    pt_user_id: ptUserId,
    summary,
  });
}
