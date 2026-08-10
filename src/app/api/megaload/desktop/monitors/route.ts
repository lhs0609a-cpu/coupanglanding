import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { touchTokenWorkerHeartbeat, localEndpointFromQuery } from '@/lib/megaload/desktop-heartbeat';

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
  //   ?lport=&lnonce= 로 로컬 서버 주소도 함께 받는다(세션 하트비트가 죽어도 웹이 앱을 찾도록).
  await touchTokenWorkerHeartbeat(serviceClient, shUserId, null, localEndpointFromQuery(url));

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
  const SELECT = 'id, coupang_product_id, source_url, source_status, registered_option_name, last_checked_at, consecutive_errors';

  // ── 품질 게이트: 망가진 도우미가 자기 유저의 모니터를 인질로 잡지 못하게 한다 ──
  //
  // 2026-08-10 실측으로 드러난 문제: 도우미 별도 앱(apps/desktop-monitor)은 Electron net.request 로
  // 네이버에 직결하는데 GT 폴백이 아예 없어서 안티봇에 걸린다 — 최근 24h 조회분 실패율 76%
  // (7,734건 중 5,893건). 같은 기간 서버 크론(GT 프록시 경유)은 2%다. 페이싱 문제가 아니라
  // 전송 경로 문제라, 30~75초/건으로 늦춰도 풀리지 않는다.
  //
  // 그냥 두면 더 나빠진다: 망가진 도우미가 계속 error 를 보고 → 백오프가 24h·72h·7d 로 올라가
  // **정상 동작하는 서버 크론까지 그 상품을 못 보게 된다**(서버도 due 인 것만 고른다).
  // 즉 고장난 경로가 멀쩡한 경로를 굶긴다.
  //
  // → 최근 실패율이 압도적인 도우미에게는 일감을 주지 않는다. 그러면 그 유저 상품은 자연히
  //   서버 크론이 가져가 98% 로 처리하고, 성공 즉시 백오프가 0 으로 리셋된다.
  //   롤링 윈도(최근 6시간)라 도우미가 회복되면(앱 교체·IP 회복) 자동으로 다시 일감을 받는다.
  const sinceIso = new Date(Date.now() - 6 * 3600_000).toISOString();
  const countIn = async (extra: (q: ReturnType<typeof buildBase>) => ReturnType<typeof buildBase>) => {
    const { count } = await extra(buildBase());
    return count || 0;
  };
  function buildBase() {
    return serviceClient
      .from('sh_stock_monitors')
      .select('id', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .eq('is_active', true)
      .gte('last_checked_at', sinceIso);
  }
  const recentTotal = await countIn(q => q);
  if (recentTotal >= 20) {
    const recentError = await countIn(q => q.eq('source_status', 'error'));
    const failRate = recentError / recentTotal;
    if (failRate >= 0.5) {
      console.warn(`[desktop/monitors] 품질 게이트: user=${shUserId} 최근6h 실패율 ${Math.round(failRate * 100)}% (${recentError}/${recentTotal}) — 일감 배포 중단, 서버 크론이 대신 처리`);
      return NextResponse.json({
        monitors: [],
        count: 0,
        nextPollSec: 900,
        paused: true,
        reason: `최근 조회 실패율이 ${Math.round(failRate * 100)}% 라 이 PC의 조회를 잠시 멈춥니다. 서버가 대신 확인하며, 회복되면 자동 재개됩니다.`,
      });
    }
  }

  // ── 우선순위 A: 정합성 불일치 건 ──
  //   원본과 쿠팡 판매상태가 어긋난 상품은 곧 매출(재입고 미재개)이나 오버셀(품절 판매중)로 직결된다.
  //   쿠팡 재개는 "신선한 원본 확인" 뒤에만 하기로 했으므로(오래된 판정으로 되살리면 이미 다시
  //   품절된 상품을 파는 사고), 재조회 큐에서 이들을 먼저 태워야 reconcile 이 굶지 않는다.
  //   실측(2026-08-10): 재입고인데 쿠팡 중지 1,361건이 마지막 확인 중앙값 6.7일째 방치.
  //   due 여부를 무시하지는 않는다 — 백오프를 뚫고 무한 재조회되면 그게 옛 429 증폭 루프다.
  const priorityLimit = Math.max(1, Math.floor(limit * 0.3));
  const { data: priority } = await serviceClient
    .from('sh_stock_monitors')
    .select(SELECT)
    .eq('megaload_user_id', shUserId)
    .eq('is_active', true)
    .not('source_url', 'is', null)
    .or('and(source_status.eq.in_stock,coupang_status.eq.suspended),and(source_status.eq.sold_out,coupang_status.eq.active),and(source_status.eq.removed,coupang_status.eq.active)')
    .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(priorityLimit);

  const priorityRows = priority || [];
  const seen = new Set(priorityRows.map(r => (r as { id: string }).id));

  // ── 우선순위 B: 통상 due 큐 ──
  const { data, error } = await serviceClient
    .from('sh_stock_monitors')
    .select(SELECT)
    .eq('megaload_user_id', shUserId)
    .eq('is_active', true)
    .not('source_url', 'is', null)
    .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
    .order('next_check_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const merged = [
    ...priorityRows,
    ...(data || []).filter(r => !seen.has((r as { id: string }).id)),
  ].slice(0, limit);

  return NextResponse.json({
    monitors: merged,
    count: merged.length,
    // 최소 폴링 간격 180초 (3분) — 옛 데스크탑 앱이 minIntervalSec=60 보내도 함수 호출 폭주 방지
    // 처리할 모니터 0개면 더 길게 (5분) — 빈 응답으로 cycle 돌리는 비용 절감
    nextPollSec: merged.length === 0
      ? Math.max(300, minIntervalSec / 4)
      : Math.max(180, minIntervalSec / 4),
  });
}
