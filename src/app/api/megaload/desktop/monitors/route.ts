import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

/**
 * GET /api/megaload/desktop/monitors
 * 데스크탑 앱이 자기가 처리할 모니터 목록 fetch.
 *
 * Header: Authorization: Bearer {desktop_app_token}
 *
 * 정책:
 *   - source_url 있는 활성 모니터만
 *   - last_checked_at 오래된 순 (정확하게 라운드로빈)
 *   - 한 번에 50개 (데스크탑 앱이 10초 간격으로 처리 → 약 8~9분 소요)
 *   - consecutive_errors >= 10 도 포함 (데스크탑 IP는 차단 안 됐을 가능성)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token')?.trim();
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || queryToken;
  if (!token || token.length !== 64) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  const { data: shUser } = await serviceClient
    .from('megaload_users')
    .select('id')
    .eq('desktop_app_token', token)
    .single();

  if (!shUser) return NextResponse.json({ error: 'token not found' }, { status: 401 });
  const shUserId = (shUser as { id: string }).id;

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  // 데스크탑 IP는 깨끗하므로 짧은 간격 OK
  // 기본 30분 (이전 15분에서 상향 — 함수 호출 비용 절감, 모니터링 신뢰도 영향 미미)
  // 최대 1시간으로 clamp. 옛 클라이언트가 21600 (6h) 보내도 서버에서 clamp → 즉시 처리 가능
  const requestedInterval = parseInt(url.searchParams.get('minIntervalSec') || '1800');
  const minIntervalSec = Math.min(requestedInterval, 3600);

  // 우선순위 fetch:
  //   1. 한 번도 체크 안 된 것 (last_checked_at IS NULL) — 즉시
  //   2. minIntervalSec 이상 지난 것 (안정 상품 라운드로빈)
  //   3. 미확인/오류 상태 — retryBackoff(15분) 지난 것만 (안정 상품보다 빠르되 매 사이클은 아님)
  //
  // ⚠️ 429 증폭 루프 차단(2026-07 수정):
  //   기존엔 source_status ∈ (오류,error) 또는 consecutive_errors≥1 인 상품을 last_checked_at 무시하고
  //   매 tick(2분) 즉시 재조회했다. 그런데 429(transient)는 상품이 아니라 IP/속도 문제 → 즉시 재조회해도
  //   또 429 → source_status='error' 고착 → 다음 tick 또 즉시 재조회 → IP가 식을 틈 없이 계속 hot →
  //   429 무한 증폭. (대시보드 "오류 161" + 판매중 상품이 429로 오류 표시되던 근본 원인.)
  //   → 오류/미확인도 retryBackoff(15분) 백오프 후에만 재조회하게 해 IP 회복 시간을 확보한다.
  //   최초 확인(last_checked_at IS NULL)은 여전히 즉시 처리되므로 신규 등록 반영 지연은 없다.
  const cutoff = new Date(Date.now() - minIntervalSec * 1000).toISOString();
  const RETRY_BACKOFF_SEC = 900; // 15분 — 미확인/오류 재조회 최소 간격(429 IP 회복 시간)
  const retryCutoff = new Date(Date.now() - RETRY_BACKOFF_SEC * 1000).toISOString();
  const { data, error } = await serviceClient
    .from('sh_stock_monitors')
    .select('id, coupang_product_id, source_url, source_status, registered_option_name, last_checked_at, consecutive_errors')
    .eq('megaload_user_id', shUserId)
    .eq('is_active', true)
    .not('source_url', 'is', null)
    .or(
      [
        'last_checked_at.is.null',
        `last_checked_at.lt.${cutoff}`,
        `and(last_checked_at.lt.${retryCutoff},source_status.in.(미확인,확인불가,오류,unknown,error))`,
        `and(last_checked_at.lt.${retryCutoff},consecutive_errors.gte.1)`,
      ].join(','),
    )
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    monitors: data || [],
    count: data?.length || 0,
    // 최소 폴링 간격 180초 (3분) — 옛 데스크탑 앱이 minIntervalSec=60 보내도 함수 호출 폭주 방지
    // 처리할 모니터 0개면 더 길게 (5분) — 빈 응답으로 cycle 돌리는 비용 절감
    nextPollSec: (data?.length || 0) === 0
      ? Math.max(300, minIntervalSec / 4)
      : Math.max(180, minIntervalSec / 4),
  });
}
