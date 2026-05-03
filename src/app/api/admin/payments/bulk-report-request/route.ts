import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { createBulkNotifications } from '@/lib/utils/notifications';
import { kstMonthStr } from '@/lib/payments/billing-constants';

/**
 * POST /api/admin/payments/bulk-report-request
 * 직전 마감월의 monthly_reports 가 없는 PT생 전원에게 "리포트 제출 요청" 알림 일괄 발송.
 *
 * 자동결제가 0건인 가장 흔한 원인이 "PT생이 매출 리포트를 안 냄" 인데,
 * 이 경우 운영자가 한 명씩 알림 보내는 대신 일괄로 안내할 수 있게 한다.
 *
 * 대상: terminated 가 아닌 모든 PT 사용자 중, 직전 마감월에 monthly_report 가 없는 사용자.
 *       contracts.status 무관 — 미서명자에게도 보내서 등록을 독려.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();
    const now = new Date();
    const currentMonth = kstMonthStr(now);
    const [cy, cm] = currentMonth.split('-').map(Number);
    const prevM = cm === 1 ? 12 : cm - 1;
    const prevY = cm === 1 ? cy - 1 : cy;
    const targetMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;

    // 활성 PT 사용자 (terminated 제외)
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, is_test_account')
      .neq('status', 'terminated');

    if (!ptUsers || ptUsers.length === 0) {
      return NextResponse.json({ success: true, notified: 0, targetMonth, message: '대상 PT 유저 없음' });
    }

    // 테스트 계정 제외
    const realPtUsers = ptUsers.filter((u) => !u.is_test_account);
    const ptUserIds = realPtUsers.map((u) => u.id);

    // 이미 직전 마감월 리포트가 있는 사용자
    const { data: existingReports } = await serviceClient
      .from('monthly_reports')
      .select('pt_user_id')
      .eq('year_month', targetMonth)
      .in('pt_user_id', ptUserIds);

    const submittedIds = new Set((existingReports || []).map((r) => r.pt_user_id));

    // 미제출 PT생만 추림
    const targetProfileIds = realPtUsers
      .filter((u) => !submittedIds.has(u.id))
      .map((u) => u.profile_id);

    if (targetProfileIds.length === 0) {
      return NextResponse.json({
        success: true,
        notified: 0,
        targetMonth,
        message: '미제출 PT생 없음 — 모두 리포트 제출 완료',
      });
    }

    await createBulkNotifications(serviceClient, targetProfileIds, {
      type: 'fee_payment',
      title: `[중요] ${targetMonth} 매출 리포트 제출 요청`,
      message: `${targetMonth} 매출 리포트가 아직 제출되지 않았습니다. 자동결제 진행을 위해 즉시 /my/report 에서 매출 보고서를 작성하고 "확정" 버튼을 눌러주세요. 미제출 시 단계적 서비스 락이 적용됩니다.`,
      link: '/my/report',
    });

    return NextResponse.json({
      success: true,
      notified: targetProfileIds.length,
      targetMonth,
      totalPtUsers: realPtUsers.length,
      alreadySubmitted: submittedIds.size,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/bulk-report-request error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
