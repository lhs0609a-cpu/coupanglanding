import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { reconcileCoupangState, type ReconcileRecord } from '@/lib/megaload/services/stock-monitor-engine';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300;

/**
 * GET /api/cron/megaload-stock-reconcile
 * 정합성 reconcile — 원본 판정과 쿠팡 판매상태가 어긋난 상품만 골라 쿠팡 토글을 맞춘다.
 *
 * 왜 조회 크론과 분리했나 (2026-08-10 실측):
 *   쿠팡 토글이 네이버 조회 배치(processMonitorBatch) 안에만 있어서, 조회 큐 18,605건에
 *   갇혀 있었다. 그 결과 "재입고됐는데 쿠팡 중지" 1,361건이 마지막 확인 중앙값 6.7일째
 *   방치돼 순수 매출 손실이 났고, "원본 삭제인데 쿠팡 판매중" 484건은 오버셀 위험이었다.
 *   토글은 쿠팡 API 만 쓰므로 네이버 rate 예산을 한 톨도 안 쓴다 → 별도 크론이 정답.
 *
 * 정책:
 *   - 중지(품절/삭제 → suspend): 판정 신선도와 무관하게 즉시. 보수적인 쪽이라 틀려도 안전.
 *   - 재개(재입고 → resume): 6시간 이내 판정만. 오래된 건은 재조회 큐 앞으로 보내고(promote)
 *     신선한 판정이 들어온 다음 사이클에 재개한다. ("전량 재조회 후 재개" — 사용자 확정)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const startedAt = Date.now();
  const DEADLINE_MS = 240_000;

  // 불일치 건만 — 부분 인덱스(idx_stock_monitors_mismatch)가 커버한다.
  //   오래 방치된 것부터(last_checked_at 오름차순) 처리해 backlog 를 앞에서부터 녹인다.
  const LIMIT = 250;
  const { data, error } = await supabase
    .from('sh_stock_monitors')
    .select('id, megaload_user_id, product_id, coupang_product_id, source_status, coupang_status, last_checked_at, registered_option_name')
    .eq('is_active', true)
    .not('coupang_product_id', 'is', null)
    .neq('coupang_product_id', '')
    .or(
      [
        'and(source_status.eq.sold_out,coupang_status.eq.active)',
        'and(source_status.eq.removed,coupang_status.eq.active)',
        'and(source_status.eq.in_stock,coupang_status.eq.suspended)',
      ].join(','),
    )
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(LIMIT);

  if (error) {
    void logSystemError({ source: 'cron/megaload-stock-reconcile', error }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as ReconcileRecord[];
  if (rows.length === 0) {
    return NextResponse.json({ message: '불일치 없음', total: 0 });
  }

  // 오버셀 위험(중지해야 하는 건)을 앞에 세운다 — 시간이 모자라 잘려도 안전한 쪽부터 처리.
  const ordered = [
    ...rows.filter(r => r.coupang_status === 'active'),
    ...rows.filter(r => r.coupang_status !== 'active'),
  ];

  // 남은 시간에 맞춰 자른다. 건당 쿠팡 API 2회(상세+재고) + 토글 1회 ≈ 1.5초로 잡는다.
  const budget = Math.max(1, Math.floor((DEADLINE_MS - (Date.now() - startedAt)) / 1500));
  const slice = ordered.slice(0, budget);

  let results;
  try {
    results = await reconcileCoupangState(slice, supabase);
  } catch (err) {
    void logSystemError({ source: 'cron/megaload-stock-reconcile', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }

  const stats = {
    총불일치: rows.length,
    처리: slice.length,
    중지: results.filter(r => r.action === 'suspended').length,
    재개: results.filter(r => r.action === 'resumed').length,
    재조회승격: results.filter(r => r.action === 'promoted_for_recheck').length,
    건너뜀: results.filter(r => r.action === 'skipped').length,
    실패: results.filter(r => r.action === 'failed').length,
  };
  console.log('[stock-reconcile]', JSON.stringify(stats));

  return NextResponse.json({
    message: '정합성 reconcile 완료',
    ...stats,
    실패사유: results.filter(r => r.action === 'failed').slice(0, 5).map(r => r.reason),
    elapsedMs: Date.now() - startedAt,
  });
}
