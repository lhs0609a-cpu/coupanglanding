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
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
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
  const minIntervalSec = parseInt(url.searchParams.get('minIntervalSec') || '21600'); // 6시간

  const { data, error } = await serviceClient
    .from('sh_stock_monitors')
    .select('id, coupang_product_id, source_url, source_status, registered_option_name, last_checked_at')
    .eq('megaload_user_id', shUserId)
    .eq('is_active', true)
    .not('source_url', 'eq', '')
    .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - minIntervalSec * 1000).toISOString()}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    monitors: data || [],
    count: data?.length || 0,
    nextPollSec: Math.max(60, minIntervalSec / 4),
  });
}
