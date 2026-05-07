import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyAdminSettlementDelay, notifyAdminOverdueAlert } from '@/lib/utils/notifications';
import { getReportTargetMonth, getSettlementDeadline } from '@/lib/utils/settlement';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function POST() {
  try {
    const serviceClient = await createServiceClient();
    const yearMonth = getReportTargetMonth();
    const deadline = getSettlementDeadline(yearMonth);
    const now = new Date();

    // 마감일이 아직 안 지났으면 스킵
    if (now <= deadline) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: '아직 마감일 전입니다.',
      });
    }

    // 마감일 초과 + 미확인 리포트 조회 (submitted, reviewed, deposited 상태)
    const { data: overdueReports, error } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, year_month, payment_status, pt_user:pt_users(profile_id)')
      .eq('year_month', yearMonth)
      .in('payment_status', ['submitted', 'reviewed', 'deposited']);

    if (error) {
      return NextResponse.json({ error: `조회 실패: ${error.message}` }, { status: 500 });
    }

    if (!overdueReports || overdueReports.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: '미확인 정산이 없습니다.',
      });
    }

    // 사용자에게 정산 처리 안내 알림
    let userNotifCount = 0;
    for (const report of overdueReports) {
      const ptUser = report.pt_user as unknown as { profile_id: string } | null;
      if (ptUser?.profile_id) {
        await notifyAdminSettlementDelay(serviceClient, ptUser.profile_id, yearMonth);
        userNotifCount++;
      }
    }

    // 관리자에게 미확인 정산 경고 알림
    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    let adminNotifCount = 0;
    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await notifyAdminOverdueAlert(serviceClient, admin.id, overdueReports.length);
        adminNotifCount++;
      }
    }

    return NextResponse.json({
      success: true,
      overdueCount: overdueReports.length,
      userNotifications: userNotifCount,
      adminNotifications: adminNotifCount,
      yearMonth,
    });
  } catch (err) {
    console.error('admin-settlement-overdue error:', err);
    void logSystemError({ source: 'admin-settlement-overdue', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
