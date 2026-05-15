import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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

  // heartbeat 갱신
  await serviceClient
    .from('megaload_users')
    .update({ desktop_app_last_heartbeat: new Date().toISOString() })
    .eq('id', shUserId);

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of results) {
    try {
      // 사용자 모니터인지 검증 (다른 사용자 모니터 update 차단)
      const { data: mon } = await serviceClient
        .from('sh_stock_monitors')
        .select('id, source_status, source_price_last, consecutive_errors')
        .eq('id', r.monitorId)
        .eq('megaload_user_id', shUserId)
        .single();

      if (!mon) {
        skipped++;
        continue;
      }

      const m = mon as { id: string; source_status: string; source_price_last: number | null; consecutive_errors: number };
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

      await serviceClient.from('sh_stock_monitors').update(updates).eq('id', r.monitorId);

      // 상태 변경 로그
      if (m.source_status !== r.status && r.status !== 'error') {
        await serviceClient.from('sh_stock_monitor_logs').insert({
          monitor_id: r.monitorId,
          megaload_user_id: shUserId,
          event_type: 'desktop_check',
          source_status_before: m.source_status,
          source_status_after: r.status,
          notes: `데스크탑 앱 체크: ${r.matchedPattern || ''}`,
        });
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
