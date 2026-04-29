import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';
import { getPreviousMonthYM } from '@/lib/payments/ad-cost';

/**
 * GET /api/cron/ad-cost-deadline
 *
 * 매월 2일 00:30 KST 권장 — 직전 달 미제출자 → status='missed' lock.
 *
 * 동작:
 *   1. active PT 전체 조회
 *   2. 직전 달에 ad_cost_submissions 행이 하나도 없는 사용자 추출
 *   3. 각 사용자에게 (pt_user_id, year_month, status='missed', amount=0, screenshot_url='') row 삽입
 *      → 차후 cost_advertising = 0 으로 확정
 *   4. 인앱 알림 발송
 *
 * pending 상태로 남아있는 제출은 그대로 둠 (관리자가 마저 검토)
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  const targetMonth = getPreviousMonthYM();

  const { data: ptUsers } = await serviceClient
    .from('pt_users')
    .select('id, profile_id')
    .eq('status', 'active');
  if (!ptUsers || ptUsers.length === 0) {
    return NextResponse.json({ ok: true, locked: 0, message: 'active PT 없음' });
  }

  const { data: submitted } = await serviceClient
    .from('ad_cost_submissions')
    .select('pt_user_id')
    .eq('year_month', targetMonth);
  const submittedSet = new Set((submitted || []).map((s) => s.pt_user_id));

  const missedUsers = ptUsers.filter((u) => !submittedSet.has(u.id));

  let locked = 0;
  for (const u of missedUsers) {
    const { error } = await serviceClient
      .from('ad_cost_submissions')
      .insert({
        pt_user_id: u.id,
        year_month: targetMonth,
        amount: 0,
        screenshot_url: '',
        attempt_no: 1,
        status: 'missed',
        reviewed_at: new Date().toISOString(),
      });
    if (!error) {
      locked++;
      if (u.profile_id) {
        await createNotification(serviceClient, {
          userId: u.profile_id,
          type: 'settlement',
          title: `${targetMonth} 광고비 미제출 — 0원 확정`,
          message: `광고비 제출 마감일이 지나 ${targetMonth} 광고비는 0원으로 확정되었습니다. 정산에서 광고비 차감 없이 계산됩니다.`,
          link: '/my/ad-cost',
        });
      }
    }
  }

  return NextResponse.json({ ok: true, targetMonth, locked });
}
