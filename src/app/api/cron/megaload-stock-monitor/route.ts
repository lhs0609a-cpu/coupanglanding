import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processMonitorBatch, type MonitorRecord } from '@/lib/megaload/services/stock-monitor-engine';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300; // 5분 타임아웃

/**
 * GET /api/cron/megaload-stock-monitor
 * 서버 크론 품절 조회 — 도우미(가정 IP)가 없는 사용자를 위한 폴백 경로.
 *
 * ⚠️ 2026-08-10 실측으로 드러난 것들:
 *   - 하루 50회 실행(스케줄 정상)인데 run 당 22건 / 236초에서 강제 종료.
 *     limit 60 × 건당 약 11초 = 660초가 필요한데 maxDuration 은 300초라 매번 잘렸다.
 *     결과: 설계 용량 2,880건/일 대비 실제 969건/일(34%).
 *   - 앞단 Phase 1(가격 백필)이 약 60초를 먼저 먹어 Phase 2 예산을 갉아먹었고,
 *     뒤에 있던 Phase 3(에러 재시도)은 단 한 번도 실행된 적이 없다.
 *
 * 수정:
 *   - Phase 1 → /api/cron/megaload-stock-price-backfill 로 분리 (쿠팡 API 전용, 예산 분리)
 *   - Phase 3 → 지수 백오프(stock-monitor-schedule.ts)가 대체. 별도 재시도 단계 불필요.
 *   - processMonitorBatch 에 soft deadline 을 넘겨, 잘리는 대신 스스로 멈추게 한다
 *     (중간에 프로세스가 죽으면 진행 중이던 건의 결과가 통째로 유실된다)
 *   - 경로별 페이싱 + 동시성 4 → 같은 wall-clock 안에 22건 → 약 250건
 *
 * ⚠️ "서버는 datacenter IP라 네이버에 차단된다" 는 전제는 실측으로 뒤집혔다(2026-08-10).
 *   최근 24h 조회분 기준 이 경로 실패율 2%(974건 중 16건), 반면 가정 IP 로 도는 도우미
 *   별도 앱은 76%(7,734건 중 5,893건). URL 도메인 구성은 양쪽 동일이라 교란요인이 아니다.
 *   이유는 IP 가 아니라 전송 경로다 — 이쪽은 Google Translate 프록시(구글 IP가 네이버를 대신
 *   fetch)를 1차로 타고, 네이버는 구글에 429 를 주지 않는다. 도우미 별도 앱은 Electron
 *   net.request 로 직결해 안티봇에 걸린다(그래서 30~75초/건으로 늦춰도 안 풀린다).
 *   → 품절 확인의 주 경로는 도우미가 아니라 이 크론이다. 도우미는 추가 용량일 뿐이다.
 *
 * 주기는 30분 유지 = Vercel 비용 동결. 처리량은 sleep 제거로 얻었지 호출 횟수로 얻지 않았다.
 * 더 필요하면 주기를 15분으로 줄이면 되지만 그때는 함수 실행시간이 2배가 된다.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const startedAt = Date.now();
  // 300s 한도에서 40s 여유 — 응답 직렬화·로그 기록 시간을 남긴다.
  const deadlineAt = startedAt + 260_000;

  // ── 용량 상한(= 본사가 감당할 수준). 둘 다 env 로 조절 가능. ──
  //
  // ⚠️ 비용 감각 주의: Vercel 은 **실행 시간**으로 과금하므로, 한 번 실행에서 22건을 하든
  //   250건을 하든 260초를 쓰면 비용이 같다. 즉 적게 처리하는 건 돈을 아끼는 게 아니라
  //   이미 지불한 시간을 놀리는 것이다(예전이 정확히 그 상태였다 — 236초 중 160초가 sleep).
  //   실제 제약은 비용이 아니라 네이버/구글의 관용도다.
  const RUN_LIMIT = Math.max(1, Number(process.env.STOCK_MONITOR_RUN_LIMIT || 200));
  // 한 번 실행에서 유저 1명이 가져갈 수 있는 최대치(공정성 상한).
  const PER_USER_RUN = Math.max(1, Number(process.env.STOCK_MONITOR_PER_USER_RUN || 12));
  // 유저 1명의 롤링 24시간 할당량. 0 이면 무제한.
  //   경로 무관 집계라, 자기 도우미가 잘 도는 유저는 자연히 서버 예산을 덜 쓴다
  //   (실측: 도우미가 정상인 유저는 자체적으로 하루 1만 건 넘게 확인한다).
  const DAILY_QUOTA = Math.max(0, Number(process.env.STOCK_MONITOR_DAILY_QUOTA || 300));

  // ── 공정 배분 스케줄러 (pick_due_stock_monitors) ──
  //   due 인 것 중에서 **유저별 라운드로빈**으로 뽑는다: 전 유저의 1순위 → 전 유저의 2순위 → …
  //   단순 "전역 오래된 순"이면 모니터를 많이 가진 유저가 큐를 독식한다(최대 3,631개 vs 1개).
  //   유저가 늘어도 RUN_LIMIT 은 그대로라 1인당 몫만 자연히 줄어든다 = 비용이 유저 수에
  //   비례해 늘지 않는다. 상품이 적은 유저는 일찍 소진되고 남은 용량은 큰 유저로 흘러간다.
  // 이 함수는 마이그레이션으로 추가돼 생성된 DB 타입에 없다 → 행 타입을 직접 지정한다.
  //
  // ⚠️ 배포 순서 의존성을 없앤다: 할당량(p_daily_quota)은 나중 마이그레이션에서 추가된
  //   3인자 버전에만 있다. 코드가 DB보다 먼저 배포되면 3인자 호출이 PGRST202(함수 없음)로
  //   실패해 크론이 통째로 죽는다 — "마이그레이션 먼저"라는 암묵적 순서는 언젠가 반드시
  //   깨진다(롤백·재배포·다른 환경). 그래서 실패하면 2인자로 자동 폴백한다.
  //   마이그레이션이 적용되는 순간 별도 조치 없이 할당량이 켜진다.
  let rpc = await supabase.rpc('pick_due_stock_monitors', {
    p_limit_per_user: PER_USER_RUN,
    p_total: RUN_LIMIT,
    p_daily_quota: DAILY_QUOTA,
  });
  let quotaApplied = true;
  if (rpc.error && rpc.error.code === 'PGRST202') {
    console.warn('[stock-monitor-cron] 할당량 마이그레이션 미적용 — 2인자 폴백으로 계속 진행');
    quotaApplied = false;
    rpc = await supabase.rpc('pick_due_stock_monitors', {
      p_limit_per_user: PER_USER_RUN,
      p_total: RUN_LIMIT,
    });
  }
  const queryErr = rpc.error;
  const monitors = (rpc.data ?? []) as unknown as Record<string, unknown>[];

  if (queryErr) {
    console.error('[stock-monitor-cron] Query error:', queryErr);
    void logSystemError({ source: 'cron/megaload-stock-monitor', error: queryErr }).catch(() => {});
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!monitors || monitors.length === 0) {
    return NextResponse.json({ message: '체크 대상 없음', checked: 0 });
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
    check_backoff_level: (m.check_backoff_level as number | null) ?? 0,
    registered_option_name: (m.registered_option_name as string) || null,
    price_follow_rule: (m.price_follow_rule as MonitorRecord['price_follow_rule']) || null,
    source_price_last: (m.source_price_last as number | null) ?? null,
    our_price_last: (m.our_price_last as number | null) ?? null,
    price_last_updated_at: (m.price_last_updated_at as string | null) ?? null,
    price_last_applied_at: (m.price_last_applied_at as string | null) ?? null,
    pending_price_change: (m.pending_price_change as MonitorRecord['pending_price_change']) || null,
  }));

  const results = await processMonitorBatch(typedMonitors, supabase, { deadlineAt });

  const rateLimited = results.filter(r => r.error?.includes('429')).length;
  const stats = {
    total: results.length,
    fetched: typedMonitors.length,
    checked: results.filter(r => r.checked).length,
    changed: results.filter(r => r.changed).length,
    errors: results.filter(r => r.error).length,
    rateLimited,
    actions: results.filter(r => r.action).map(r => r.action),
    elapsedMs: Date.now() - startedAt,
    // 할당량이 실제로 적용됐는지 응답·로그에 남긴다 — 폴백이 조용히 지속되는 걸 막는다.
    quotaApplied,
  };

  console.log(`[stock-monitor-cron] 완료: ${stats.checked}/${stats.fetched} 체크, ${stats.changed} 변경, ${stats.errors} 에러 (429: ${rateLimited}), ${stats.elapsedMs}ms, 할당량=${quotaApplied ? DAILY_QUOTA : '미적용(폴백)'}`);

  return NextResponse.json({ message: '품절 모니터링 완료', ...stats });
}
