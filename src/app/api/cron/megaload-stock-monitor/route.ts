import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMonitorBatch, type MonitorRecord } from '@/lib/megaload/services/stock-monitor-engine';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { recordCoupangApiFailure, clearCoupangApiBlock } from '@/lib/utils/coupang-circuit-breaker';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300; // 5분 타임아웃

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * GET /api/cron/megaload-stock-monitor
 * 30분마다 실행 — 품절 모니터링 배치 처리 + 가격 자동 백필
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // ── Phase 1: 가격 미조회 모니터 자동 백필 (our_price_last IS NULL) ──
  let priceBackfilled = 0;
  try {
    // 가격 미조회 모니터를 사용자별로 그룹
    const { data: needPrice } = await supabase
      .from('sh_stock_monitors')
      .select('id, megaload_user_id, coupang_product_id, coupang_status')
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(30); // 크론 1회당 30개씩

    if (needPrice && needPrice.length > 0) {
      // ── circuit breaker — 차단된 셀러의 megaload_user_id 미리 식별 ──
      // megaload_users.profile_id → pt_users.profile_id 매핑으로 차단 여부 확인.
      const monitorMegaloadUserIds = Array.from(new Set(
        (needPrice as Array<{ megaload_user_id: string }>).map(m => m.megaload_user_id),
      ));
      const { data: shUsers } = await supabase
        .from('megaload_users')
        .select('id, profile_id')
        .in('id', monitorMegaloadUserIds);
      const profileIds = (shUsers || []).map(u => (u as Record<string, unknown>).profile_id as string).filter(Boolean);
      const { data: blockedPt } = await supabase
        .from('pt_users')
        .select('id, profile_id')
        .in('profile_id', profileIds)
        .gt('coupang_api_blocked_until', new Date().toISOString());
      const blockedProfileIds = new Set(
        (blockedPt || []).map(r => (r as Record<string, unknown>).profile_id as string),
      );
      const profileToPtId = new Map<string, string>();
      for (const r of (blockedPt || []) as Array<Record<string, unknown>>) {
        profileToPtId.set(r.profile_id as string, r.id as string);
      }
      // megaload_user_id → 차단여부, megaload_user_id → ptUserId 매핑
      const blockedMegaloadUserIds = new Set<string>();
      const megaloadToPtId = new Map<string, string>();
      // 차단 여부와 무관하게 모든 (megaload_user_id, profile_id) 매핑 만들기
      for (const u of (shUsers || []) as Array<Record<string, unknown>>) {
        const pid = u.profile_id as string;
        const mid = u.id as string;
        if (blockedProfileIds.has(pid)) blockedMegaloadUserIds.add(mid);
        // 차단된 셀러 매핑은 위에서 했으니, 미차단 셀러도 ptUserId 매핑 필요. 별도 쿼리.
      }
      if (blockedMegaloadUserIds.size > 0) {
        console.log(`[stock-monitor-cron] Phase 1: ${blockedMegaloadUserIds.size}명 차단 셀러 skip`);
      }

      // 미차단 셀러 → ptUserId 매핑 (실패 기록 시 사용)
      const unblockedProfileIds = profileIds.filter(p => !blockedProfileIds.has(p));
      if (unblockedProfileIds.length > 0) {
        const { data: activePt } = await supabase
          .from('pt_users')
          .select('id, profile_id')
          .in('profile_id', unblockedProfileIds);
        for (const r of (activePt || []) as Array<Record<string, unknown>>) {
          profileToPtId.set(r.profile_id as string, r.id as string);
        }
      }
      for (const u of (shUsers || []) as Array<Record<string, unknown>>) {
        const pid = u.profile_id as string;
        const mid = u.id as string;
        const ptId = profileToPtId.get(pid);
        if (ptId) megaloadToPtId.set(mid, ptId);
      }

      // 사용자별 어댑터 캐시
      const adapterCache = new Map<string, CoupangAdapter>();
      const now = new Date().toISOString();

      for (const m of needPrice as { id: string; megaload_user_id: string; coupang_product_id: string; coupang_status: string }[]) {
        // circuit breaker — 차단된 셀러는 cron skip (비용 폭증 차단)
        if (blockedMegaloadUserIds.has(m.megaload_user_id)) continue;

        try {
          let adapter = adapterCache.get(m.megaload_user_id);
          if (!adapter) {
            adapter = await getAuthenticatedAdapter(supabase, m.megaload_user_id, 'coupang') as CoupangAdapter;
            adapterCache.set(m.megaload_user_id, adapter);
          }

          const detail = await adapter.getProductDetail(m.coupang_product_id);
          if (detail) {
            const price = detail.items?.[0]?.salePrice ?? null;
            const status: 'active' | 'suspended' = detail.statusName === 'APPROVE' ? 'active' : 'suspended';
            const updates: Record<string, unknown> = { updated_at: now, last_checked_at: now };
            if (price != null && price > 0) updates.our_price_last = price;
            if (status !== m.coupang_status) updates.coupang_status = status;
            await supabase.from('sh_stock_monitors').update(updates).eq('id', m.id);
            priceBackfilled++;
          }
          // 성공 — circuit breaker 해제 (이전 차단 상태에서 복구)
          const ptId = megaloadToPtId.get(m.megaload_user_id);
          if (ptId) await clearCoupangApiBlock(supabase, ptId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('429')) {
            console.log('[stock-monitor-cron] 429 rate limit during price backfill, stopping');
            break;
          }
          // IP/auth 영구 오류는 vendor 차단 등록 → 다음 cron부터 skip
          const ptId = megaloadToPtId.get(m.megaload_user_id);
          if (ptId) {
            await recordCoupangApiFailure(supabase, ptId, msg);
            // 같은 셀러의 남은 모니터는 즉시 skip
            blockedMegaloadUserIds.add(m.megaload_user_id);
          }
        }
        await sleep(1000); // 1초 딜레이 (429 방지)
      }
    }
  } catch (err) {
    console.error('[stock-monitor-cron] Price backfill error:', err);
    void logSystemError({ source: 'cron/megaload-stock-monitor', error: err }).catch(() => {});
  }

  // ── soft deadline 도입 — 300s 에 걸리지 않고 240s 에서 graceful exit ──
  // Phase 1 끝났으면 일부 시간은 소진. 240s 가 지나면 Phase 2/3 skip하고 정상 응답.
  const startedAt = (globalThis as { __cronStartedAt?: number }).__cronStartedAt ?? Date.now();
  (globalThis as { __cronStartedAt?: number }).__cronStartedAt = startedAt;
  const SOFT_DEADLINE_MS = 240_000;
  const isPastDeadline = () => Date.now() - startedAt > SOFT_DEADLINE_MS;

  // ── Phase 2: 정기 품절 모니터링 ──
  // 2026-05-15 변경: Google Translate proxy를 1차 경로로 승격 → Fly IP 우회.
  //   GT는 Google IP 경유라 네이버 throttling 무관 → 빈도 ↑ + burst ↑ 가능.
  //   PHASE2_LIMIT 50으로 복원, 주기 60분 (capacity: 2500 ÷ 50/h = 50h, 점진 ↑ 가능).
  //   미확인/오류 상태는 별도 우선 처리됨 (.or 절 참고).
  const CHECK_INTERVAL_MIN = 60;
  // 5분 maxDuration 안에 안전하게 처리 가능한 수: 30개 × 7s = 210s (여유 90s)
  const PHASE2_LIMIT = 30;
  const cutoff = new Date(Date.now() - CHECK_INTERVAL_MIN * 60 * 1000).toISOString();
  const { data: monitors, error: queryErr } = await supabase
    .from('sh_stock_monitors')
    .select('id, megaload_user_id, product_id, coupang_product_id, source_url, source_status, coupang_status, option_statuses, consecutive_errors, consecutive_unknowns, registered_option_name, price_follow_rule, source_price_last, our_price_last, price_last_updated_at, price_last_applied_at, pending_price_change')
    .eq('is_active', true)
    .lt('consecutive_errors', 10)
    .not('source_url', 'is', null)
    .neq('source_url', '')
    // 처리 대상: 한 번도 안 본 것 + 60분 지난 것 + 미확인/오류 상태 (즉시 재시도)
    .or(
      [
        'last_checked_at.is.null',
        `last_checked_at.lt.${cutoff}`,
        'source_status.in.(미확인,확인불가,오류,unknown,error)',
      ].join(','),
    )
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(PHASE2_LIMIT);

  if (queryErr) {
    console.error('[stock-monitor-cron] Query error:', queryErr);
    void logSystemError({ source: 'cron/megaload-stock-monitor', error: queryErr }).catch(() => {});
    return NextResponse.json({ error: queryErr.message, priceBackfilled }, { status: 500 });
  }

  if (!monitors || monitors.length === 0) {
    return NextResponse.json({ message: '체크 대상 없음', checked: 0, priceBackfilled });
  }

  const typedMonitors: MonitorRecord[] = monitors.map(m => ({
    id: m.id as string,
    megaload_user_id: m.megaload_user_id as string,
    product_id: m.product_id as string,
    coupang_product_id: m.coupang_product_id as string,
    source_url: m.source_url as string,
    source_status: (m.source_status as MonitorRecord['source_status']) || 'unknown',
    coupang_status: (m.coupang_status as MonitorRecord['coupang_status']) || 'active',
    option_statuses: (m.option_statuses as MonitorRecord['option_statuses']) || [],
    consecutive_errors: (m.consecutive_errors as number) || 0,
    consecutive_unknowns: (m.consecutive_unknowns as number) || 0,
    registered_option_name: (m.registered_option_name as string) || null,
    price_follow_rule: (m.price_follow_rule as MonitorRecord['price_follow_rule']) || null,
    source_price_last: (m.source_price_last as number | null) ?? null,
    our_price_last: (m.our_price_last as number | null) ?? null,
    price_last_updated_at: (m.price_last_updated_at as string | null) ?? null,
    price_last_applied_at: (m.price_last_applied_at as string | null) ?? null,
    pending_price_change: (m.pending_price_change as MonitorRecord['pending_price_change']) || null,
  }));

  const results = await processMonitorBatch(typedMonitors, supabase);

  // ── Phase 3: 에러 모니터 자동 재시도 (2시간 경과, 최대 10개) ──
  // soft deadline 도달 시 skip — Phase 2 만 처리하고 graceful exit
  let errorRetried = 0;
  if (isPastDeadline()) {
    console.log('[stock-monitor-cron] soft deadline 도달 — Phase 3 skip');
    (globalThis as { __cronStartedAt?: number }).__cronStartedAt = undefined;
  } else try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: errorMonitors } = await supabase
      .from('sh_stock_monitors')
      .select('id, megaload_user_id, product_id, coupang_product_id, source_url, source_status, coupang_status, option_statuses, consecutive_errors, consecutive_unknowns, registered_option_name, price_follow_rule, source_price_last, our_price_last, price_last_updated_at, price_last_applied_at, pending_price_change')
      .eq('is_active', true)
      .gte('consecutive_errors', 1)
      .lt('consecutive_errors', 10)
      .not('source_url', 'eq', '')
      .or(`last_checked_at.is.null,last_checked_at.lt.${twoHoursAgo}`)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(10);

    if (errorMonitors && errorMonitors.length > 0) {
      const typedErrorMonitors: MonitorRecord[] = errorMonitors.map(m => ({
        id: m.id as string,
        megaload_user_id: m.megaload_user_id as string,
        product_id: m.product_id as string,
        coupang_product_id: m.coupang_product_id as string,
        source_url: m.source_url as string,
        source_status: (m.source_status as MonitorRecord['source_status']) || 'unknown',
        coupang_status: (m.coupang_status as MonitorRecord['coupang_status']) || 'active',
        option_statuses: (m.option_statuses as MonitorRecord['option_statuses']) || [],
        consecutive_errors: (m.consecutive_errors as number) || 0,
        consecutive_unknowns: (m.consecutive_unknowns as number) || 0,
        registered_option_name: (m.registered_option_name as string) || null,
        price_follow_rule: (m.price_follow_rule as MonitorRecord['price_follow_rule']) || null,
        source_price_last: (m.source_price_last as number | null) ?? null,
        our_price_last: (m.our_price_last as number | null) ?? null,
        price_last_updated_at: (m.price_last_updated_at as string | null) ?? null,
        price_last_applied_at: (m.price_last_applied_at as string | null) ?? null,
        pending_price_change: (m.pending_price_change as MonitorRecord['pending_price_change']) || null,
      }));

      const errorResults = await processMonitorBatch(typedErrorMonitors, supabase);
      errorRetried = errorResults.filter(r => r.checked).length;
      console.log(`[stock-monitor-cron] Phase 3: ${errorRetried}/${errorMonitors.length} 에러 모니터 재시도`);
    }
  } catch (err) {
    console.error('[stock-monitor-cron] Phase 3 error retry failed:', err);
    void logSystemError({ source: 'cron/megaload-stock-monitor', error: err }).catch(() => {});
  }

  const rateLimited = results.filter(r => r.error?.includes('429')).length;

  const stats = {
    total: results.length,
    checked: results.filter(r => r.checked).length,
    changed: results.filter(r => r.changed).length,
    errors: results.filter(r => r.error).length,
    rateLimited,
    actions: results.filter(r => r.action).map(r => r.action),
    priceBackfilled,
  };

  console.log(`[stock-monitor-cron] 완료: ${stats.checked}/${stats.total} 체크, ${stats.changed} 변경, ${stats.errors} 에러 (429: ${rateLimited}), ${priceBackfilled} 가격백필, ${errorRetried} 에러재시도`);

  return NextResponse.json({
    message: '품절 모니터링 완료',
    ...stats,
    errorRetried,
  });
}
