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

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  // 데스크탑 IP는 깨끗하므로 짧은 간격 OK (기본 15분, 최대 1시간으로 clamp)
  // 옛 클라이언트가 21600 (6h) 보내도 서버에서 clamp → 즉시 처리 가능
  const requestedInterval = parseInt(url.searchParams.get('minIntervalSec') || '900');
  const minIntervalSec = Math.min(requestedInterval, 3600);

  // 우선순위 fetch:
  //   1. 미확인/확인불가/오류 상태 (즉시 처리 필요)
  //   2. 한 번도 체크 안 된 것
  //   3. minIntervalSec 이상 지난 것
  // 서버 cron이 네이버 차단으로 매번 실패해도 last_checked_at은 갱신됨 →
  //   '6시간 안 본 것' 필터로는 영원히 못 잡으므로 source_status 기반 우선순위 사용
  const cutoff = new Date(Date.now() - minIntervalSec * 1000).toISOString();
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
        'source_status.in.(미확인,확인불가,오류,unknown,error)',
        'consecutive_errors.gte.1',
      ].join(','),
    )
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    monitors: data || [],
    count: data?.length || 0,
    nextPollSec: Math.max(60, minIntervalSec / 4),
  });
}
