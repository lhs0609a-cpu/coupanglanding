import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 300; // 5분 (대량 재개 처리)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * POST /api/megaload/stock-monitor/bulk-resume
 *
 * 네이버 차단으로 인해 잘못 일시중지된 쿠팡 상품 일괄 재개.
 *
 * 대상: source_status='error' AND coupang_status='suspended' AND
 *      consecutive_errors >= 1 (네이버 차단 이력 있는 모니터만)
 *
 * 1차 IP/cron 차단으로 인한 잘못된 자동 중지를 사용자가 수동 트리거로 복구.
 * 호출 간 sleep 700ms — 쿠팡 API rate limit 고려.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    // 옵션: 특정 모니터 ID 배열만 재개 가능 (UI 선택적)
    let monitorIds: string[] | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body?.monitorIds) && body.monitorIds.length > 0) {
        monitorIds = body.monitorIds;
      }
    } catch { /* body 없으면 전체 */ }

    // 잘못 중지된 모니터 조회
    let query = serviceClient
      .from('sh_stock_monitors')
      .select('id, coupang_product_id, coupang_status, source_status, consecutive_errors')
      .eq('megaload_user_id', shUserId)
      .eq('coupang_status', 'suspended')
      .eq('source_status', 'error')
      .gte('consecutive_errors', 1)
      .not('coupang_product_id', 'eq', '');

    if (monitorIds) query = query.in('id', monitorIds);

    const { data: targets, error } = await query.limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!targets || targets.length === 0) {
      return NextResponse.json({ message: '재개 대상 없음', resumed: 0, total: 0 });
    }

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang') as CoupangAdapter;
    const now = new Date().toISOString();

    let resumed = 0;
    let failed = 0;
    const errors: { monitorId: string; error: string }[] = [];

    for (const m of targets as { id: string; coupang_product_id: string }[]) {
      try {
        await adapter.resumeProduct(m.coupang_product_id);
        // 모니터 상태 갱신: coupang_status=active, consecutive_errors=0 (다시 체크 시도)
        await serviceClient.from('sh_stock_monitors').update({
          coupang_status: 'active',
          consecutive_errors: 0,
          last_action_at: now,
          updated_at: now,
        }).eq('id', m.id);

        // 로그
        await serviceClient.from('sh_stock_monitor_logs').insert({
          monitor_id: m.id,
          megaload_user_id: shUserId,
          event_type: 'manual_resume',
          coupang_status_before: 'suspended',
          coupang_status_after: 'active',
          action_taken: 'resume_product',
          notes: '네이버 차단으로 인한 잘못된 중지 → 수동 일괄 재개',
        });

        resumed++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : '재개 실패';
        if (errors.length < 20) errors.push({ monitorId: m.id, error: msg });
        // 429 발생 시 더 긴 sleep
        if (msg.includes('429')) await sleep(5000);
      }
      await sleep(700); // 쿠팡 API rate limit (1.5/s)
    }

    return NextResponse.json({
      message: `${resumed}/${targets.length}건 재개 완료`,
      resumed,
      failed,
      total: targets.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    void logSystemError({ source: 'api/megaload/stock-monitor/bulk-resume', error: err }).catch(() => {});
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
