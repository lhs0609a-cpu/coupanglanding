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

  // ── 1) 처리할 사용자 1명 선택 ──
  //   우선순위 0: 미완료(pending) 추적 항목이 있는 유저 — 시작했지만 안 끝난 쿠폰 적용을
  //     auto_apply 여부·페이지 오픈 여부와 무관하게 서버가 끝까지 마무리(드라이브 멈춤 사각지대 제거).
  //   우선순위 1: auto_apply 사이클 도래 유저 (신규 상품 수집 + 재적용).
  let ptUserId: string | null = null;
  let isCycleRun = false;

  // 우선순위 0 — 미완료 pending 보유 유저 (쿠폰 config 가 있어야 bulk-apply 가능)
  const { data: pendingRows } = await sc
    .from('product_coupon_tracking')
    .select('pt_user_id')
    .eq('status', 'pending')
    .limit(5000);
  const pendingUserIds = [...new Set((pendingRows || []).map((r) => r.pt_user_id as string))];
  if (pendingUserIds.length > 0) {
    const { data: cfgRows } = await sc
      .from('coupon_auto_sync_config')
      .select('pt_user_id')
      .in('pt_user_id', pendingUserIds)
      .eq('is_enabled', true)
      .limit(1);
    if (cfgRows && cfgRows.length > 0) ptUserId = cfgRows[0].pt_user_id as string;
  }

  // 우선순위 1 — auto_apply 사이클 도래 유저 (가장 오래 미실행 우선)
  if (!ptUserId) {
    const { data: candidates } = await sc
      .from('coupon_auto_sync_config')
      .select('id, pt_user_id, auto_apply_cycle_days, last_auto_apply_at, instant_coupon_enabled, download_coupon_enabled')
      .eq('auto_apply_enabled', true)
      .eq('is_enabled', true)
      .order('last_auto_apply_at', { ascending: true, nullsFirst: true })
      .limit(20);
    const now = Date.now();
    const eligible = (candidates || []).find((c) => {
      const cfg = c as { last_auto_apply_at: string | null; auto_apply_cycle_days: number; instant_coupon_enabled: boolean; download_coupon_enabled: boolean };
      if (!cfg.instant_coupon_enabled && !cfg.download_coupon_enabled) return false;
      if (!cfg.last_auto_apply_at) return true; // 한 번도 안 돌린 사용자
      const elapsedDays = (now - new Date(cfg.last_auto_apply_at).getTime()) / (1000 * 60 * 60 * 24);
      return elapsedDays >= (cfg.auto_apply_cycle_days || 5);
    });
    if (eligible) {
      ptUserId = (eligible as { pt_user_id: string }).pt_user_id;
      isCycleRun = true; // 사이클 실행 — 신규 수집 + last_auto_apply_at 갱신 대상
    }
  }

  if (!ptUserId) {
    return NextResponse.json({ processed: 0, reason: 'no pending-finish or cycle-eligible users this tick' });
  }

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
  // 이번 틱에 모든 쿠폰 적용이 끝났는지(hasMore=false 도달). 미완료면 last_auto_apply_at 을
  // 갱신하지 않아 다음 틱에 같은 유저를 다시 골라 이어서 처리한다(대량 작업 5일 방치 버그 수정).
  let completed = false;

  try {
    // ── 3) collect-products 반복 (신규 상품 수집) — 사이클 실행에서만 ──
    //   pending-finish 실행은 "시작된 작업 마무리"가 목적이라 신규 상품을 더 모으지 않는다
    //   (모으면 pending 이 계속 늘어 끝나지 않음).
    let nextToken = '';
    for (let i = 0; isCycleRun && i < COLLECT_LOOP_MAX; i++) {
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
      if (!data.hasMore) { completed = true; break; }
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    void logSystemError({ source: 'cron/coupon-auto-apply', error: err, context: { ptUserId } }).catch(() => {});
  }

  summary.finished_at = new Date().toISOString();
  summary.elapsed_ms = Date.now() - tickStart;
  summary.completed = completed;
  summary.run_type = isCycleRun ? 'cycle' : 'pending-finish';

  // ── 5) last_auto_apply_at 갱신 정책 ──
  //   ① 사이클 실행이고 (완료 or 하드에러) → now() 로 갱신(다음 사이클까지 제외, 폭주 방지).
  //   ② 사이클인데 미완료 → 갱신 안 함 → 다음 틱에 이어서(대량작업 5일 방치 버그 수정).
  //   ③ pending-finish 실행 → 갱신하지 않음(사이클이 아니라 "시작된 작업 마무리"일 뿐).
  //   ※ 재시도 소진 항목은 bulk-apply 가 'failed' 로 격리해 pending→0 으로 수렴하므로 무한 독점 없음.
  const advance = isCycleRun && (completed || summary.error != null);
  const updatePayload: Record<string, unknown> = { last_auto_apply_summary: summary };
  if (advance) updatePayload.last_auto_apply_at = new Date().toISOString();
  await sc
    .from('coupon_auto_sync_config')
    .update(updatePayload)
    .eq('pt_user_id', ptUserId);

  return NextResponse.json({
    processed: 1,
    pt_user_id: ptUserId,
    summary,
  });
}
