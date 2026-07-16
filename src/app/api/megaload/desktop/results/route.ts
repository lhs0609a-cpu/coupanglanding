import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { touchTokenWorkerHeartbeat } from '@/lib/megaload/desktop-heartbeat';

export const maxDuration = 60;

/**
 * POST /api/megaload/desktop/results
 * 데스크탑 앱이 네이버 fetch 결과를 일괄 전송.
 *
 * Header: Authorization: Bearer {desktop_app_token}
 *
 * Body: { results: [{ monitorId, status, mainPrice, options, error }] }
 *
 * 처리:
 *   1. 토큰 검증
 *   2. 각 결과를 sh_stock_monitors 에 update (source_status, source_price_last 등)
 *   3. status 변경 시 sh_stock_monitor_logs 기록
 *   4. 쿠팡 자동 중지/재개 로직은 별도 (cron 또는 서버 처리)
 *      → desktop 은 데이터 수집만, 쿠팡 API 호출은 서버에서 (인증/보안)
 */
interface ResultPayload {
  monitorId: string;
  status: 'in_stock' | 'sold_out' | 'unknown' | 'removed' | 'error';
  mainPrice?: number;
  options?: { name: string; soldOut: boolean; price?: number }[];
  matchedPattern?: string;
  errorClass?: 'infra' | 'transient' | 'naver';
  fetchedAt: string;
}

/**
 * 상태 티어별 다음 조회 시각 — 무차단 재설계 P1.
 *   안정 상품은 드물게, 변동/오류는 적당히 → 총 요청량을 rate 예산 안으로 눌러 IP 과열 방지.
 *   ±25% full-jitter 로 "정확히 N시간마다" 패턴을 깨 봇 탐지를 완화한다(리서치: 결정론적 주기도 탐지됨).
 */
function computeNextCheckAt(status: string, errorClass: string | undefined, priceFollowEnabled: boolean): string {
  let minutes: number;
  switch (status) {
    case 'in_stock': minutes = priceFollowEnabled ? 180 : 720; break; // 가격추종 3h / 일반 12h
    case 'sold_out': minutes = 360; break;                            // 재입고 감시 6h
    case 'removed':  minutes = 1440; break;                           // 내려간 상품 24h
    case 'unknown':  minutes = 120; break;                            // 구조 확인 2h
    case 'error':
      // transient(429/timeout)/infra = IP/속도 문제 → 1.5h 뒤 재시도(하드 아님).
      // 하드(naver 403/파싱실패 등) = 상품측 문제 가능 → 6h 로 더 뒤로 밀어 재하머링 방지.
      minutes = (errorClass === 'transient' || errorClass === 'infra') ? 90 : 360;
      break;
    default: minutes = 360;
  }
  const jittered = minutes * (0.75 + Math.random() * 0.5); // ±25% full-jitter
  return new Date(Date.now() + jittered * 60_000).toISOString();
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const results = (body as { results?: ResultPayload[] }).results;
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'results array required' }, { status: 400 });
  }

  if (results.length > 100) {
    return NextResponse.json({ error: 'max 100 results per request' }, { status: 400 });
  }

  // heartbeat 갱신 — (1) 대시보드 "마지막 접속"용 컬럼 (2) 좌측 상단 배지가 읽는 워커 하트비트 테이블
  await serviceClient
    .from('megaload_users')
    .update({ desktop_app_last_heartbeat: new Date().toISOString() })
    .eq('id', shUserId);
  await touchTokenWorkerHeartbeat(serviceClient, shUserId);

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of results) {
    try {
      // 사용자 모니터인지 검증 (다른 사용자 모니터 update 차단)
      const { data: mon } = await serviceClient
        .from('sh_stock_monitors')
        .select('id, source_status, source_price_last, consecutive_errors, price_follow_rule')
        .eq('id', r.monitorId)
        .eq('megaload_user_id', shUserId)
        .single();

      if (!mon) {
        skipped++;
        continue;
      }

      const m = mon as { id: string; source_status: string; source_price_last: number | null; consecutive_errors: number; price_follow_rule: { enabled?: boolean } | null };
      const priceFollowEnabled = m.price_follow_rule?.enabled === true;
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        last_checked_at: now,
        updated_at: now,
      };

      if (r.status === 'error') {
        updates.source_status = 'error';
        // transient/infra 는 누적 X — desktop 도 동일 정책
        if (r.errorClass !== 'infra' && r.errorClass !== 'transient') {
          updates.consecutive_errors = m.consecutive_errors + 1;
        }
      } else {
        updates.source_status = r.status;
        updates.consecutive_errors = 0;
        if (typeof r.mainPrice === 'number' && r.mainPrice > 0) {
          updates.source_price_last = r.mainPrice;
        }
        if (Array.isArray(r.options)) {
          updates.option_statuses = r.options;
        }
      }

      // 무차단 재설계 P1: 상태 티어별 다음 조회 시각 배정 (스케줄러가 이걸로 due 판정)
      updates.next_check_at = computeNextCheckAt(r.status, r.errorClass, priceFollowEnabled);

      await serviceClient.from('sh_stock_monitors').update(updates).eq('id', r.monitorId);

      // 상태 변경 로그 (error 진입 transition 시에만 기록 → 스팸 방지)
      if (m.source_status !== r.status) {
        if (r.status === 'error') {
          // ⚠️ 그동안 도우미 조회 실패는 source_status='error'만 저장하고 사유(errorClass/matchedPattern)를
          //   버려서, DB에서 429/타임아웃/차단을 구분할 수 없었다(진단 사각지대).
          //   도우미가 보내주는 사유를 check_error 로그로 남겨 대시보드 이력에서 원인을 볼 수 있게 한다.
          await serviceClient.from('sh_stock_monitor_logs').insert({
            monitor_id: r.monitorId,
            megaload_user_id: shUserId,
            event_type: 'check_error',
            source_status_before: m.source_status,
            source_status_after: 'error',
            error_message: `도우미: ${r.errorClass || 'naver'} — ${r.matchedPattern || '조회 실패'}`,
          });
        } else {
          await serviceClient.from('sh_stock_monitor_logs').insert({
            monitor_id: r.monitorId,
            megaload_user_id: shUserId,
            event_type: 'desktop_check',
            source_status_before: m.source_status,
            source_status_after: r.status,
            notes: `데스크탑 앱 체크: ${r.matchedPattern || ''}`,
          });
        }
      }

      updated++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'unknown');
    }
  }

  return NextResponse.json({
    updated,
    skipped,
    total: results.length,
    errors: errors.slice(0, 5),
  });
}
