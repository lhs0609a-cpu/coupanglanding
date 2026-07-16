import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { touchTokenWorkerHeartbeat } from '@/lib/megaload/desktop-heartbeat';

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

  // 도우미가 살아있다는 신호 — 좌측 상단 "도우미 연결됨" 배지가 읽는 테이블에 기록(토큰 방식도 반영).
  await touchTokenWorkerHeartbeat(serviceClient, shUserId);

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  // 데스크탑 IP는 깨끗하므로 짧은 간격 OK
  // 기본 30분 (이전 15분에서 상향 — 함수 호출 비용 절감, 모니터링 신뢰도 영향 미미)
  // 최대 1시간으로 clamp. 옛 클라이언트가 21600 (6h) 보내도 서버에서 clamp → 즉시 처리 가능
  const requestedInterval = parseInt(url.searchParams.get('minIntervalSec') || '1800');
  const minIntervalSec = Math.min(requestedInterval, 3600);

  // ── 무차단 재설계 P1: next_check_at 기반 due-only 스케줄러 ──
  //   "due 인 것만" 배포한다: next_check_at IS NULL(신규·최초확인) 또는 next_check_at <= now.
  //   다음 조회 시각은 results 라우트가 상태 티어별로 미래에 배정한다(판매중 12h·품절 6h·오류 1.5~6h 등).
  //   → 안정 상품은 자연히 드물게 조회되어 총 요청량이 rate 예산 안에 들어오고, IP가 식을 틈이 생긴다.
  //
  // ⚠️ 이 방식이 429 증폭 루프를 뿌리째 제거한다:
  //   기존엔 source_status∈(오류,error)/consecutive_errors≥1 를 last_checked_at 무시하고 매 tick 즉시
  //   재조회 → 429 상품이 계속 hot → 증폭. 이제 오류도 next_check_at(미래)까지는 절대 재조회 안 함.
  //   (과거 15분 백오프 패치를 대체·강화한다.) minIntervalSec 은 nextPollSec 계산에만 사용.
  const nowIso = new Date().toISOString();
  const { data, error } = await serviceClient
    .from('sh_stock_monitors')
    .select('id, coupang_product_id, source_url, source_status, registered_option_name, last_checked_at, consecutive_errors')
    .eq('megaload_user_id', shUserId)
    .eq('is_active', true)
    .not('source_url', 'is', null)
    .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
    .order('next_check_at', { ascending: true, nullsFirst: true })
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
