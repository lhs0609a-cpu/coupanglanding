import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createBulkNotifications } from '@/lib/utils/notifications';
import { getPreviousMonthYM } from '@/lib/payments/ad-cost';

/**
 * GET /api/cron/ad-cost-reminder
 *
 * 매월 1일 09:00 KST 실행 권장.
 * 직전 달 광고비를 아직 제출하지 않은 모든 active PT 사용자에게 인앱 알림.
 *
 * "제출하지 않음" = ad_cost_submissions 에 해당 (pt_user_id, year_month) 행이 없음.
 * (pending/approved/rejected/missed/locked 모두 있으면 알림 안 보냄)
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  const targetMonth = getPreviousMonthYM();

  // active PT 전체
  const { data: ptUsers } = await serviceClient
    .from('pt_users')
    .select('id, profile_id')
    .eq('status', 'active');

  if (!ptUsers || ptUsers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'active PT 사용자 없음' });
  }

  // 이미 제출한 사용자 ID 집합 (어떤 status 든 제출 행이 있으면 제외)
  const { data: submitted } = await serviceClient
    .from('ad_cost_submissions')
    .select('pt_user_id')
    .eq('year_month', targetMonth);
  const submittedSet = new Set((submitted || []).map((s) => s.pt_user_id));

  const targetUsers = ptUsers.filter((u) => !submittedSet.has(u.id) && u.profile_id);
  if (targetUsers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, targetMonth, message: '미제출자 없음' });
  }

  await createBulkNotifications(
    serviceClient,
    targetUsers.map((u) => u.profile_id as string),
    {
      type: 'settlement',
      title: `${targetMonth} 광고비 제출 안내`,
      message: `${targetMonth} 광고비를 오늘 24시까지 제출하지 않으면 0원으로 확정되어 정산에 반영됩니다. 광고 플랫폼 스크린샷과 함께 제출해 주세요.`,
      link: '/my/ad-cost',
    },
  );

  return NextResponse.json({
    ok: true,
    sent: targetUsers.length,
    targetMonth,
  });
}
