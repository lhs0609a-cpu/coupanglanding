import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';
import { getReportTargetMonth, getSettlementDeadline } from '@/lib/utils/settlement';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * GET /api/cron/admin-overdue
 *
 * Vercel Cron이 매일 02:00 KST에 호출
 * 마감일 지난 후, 관리자가 아직 처리하지 않은 정산 건에 대해 알림
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const yearMonth = getReportTargetMonth();
    const deadline = getSettlementDeadline(yearMonth);
    const now = new Date();

    if (now <= deadline) {
      return NextResponse.json({ success: true, sent: 0, message: '아직 마감일 전입니다.' });
    }

    const serviceClient = await createServiceClient();

    // 제출됐지만 아직 confirmed가 아닌 리포트
    const { data: pendingReports, error } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, payment_status, pt_user:pt_users(profile_id)')
      .eq('year_month', yearMonth)
      .in('payment_status', ['submitted', 'reviewed', 'deposited']);

    if (error || !pendingReports?.length) {
      return NextResponse.json({ success: true, sent: 0, message: '미확인 정산 없음.' });
    }

    // 유저에게 처리 지연 안내
    let userNotifs = 0;
    for (const report of pendingReports) {
      const ptUser = report.pt_user as unknown as { profile_id: string } | null;
      if (ptUser?.profile_id) {
        await createNotification(serviceClient, {
          userId: ptUser.profile_id,
          type: 'settlement',
          title: '정산 처리 대기 중',
          message: `${yearMonth} 정산이 관리자 확인 대기 중입니다. 처리가 완료되면 알림을 보내드립니다.`,
          link: '/my/report',
        });
        userNotifs++;
      }
    }

    // 관리자에게 미처리 건수 알림
    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    let adminNotifs = 0;
    if (admins?.length) {
      for (const admin of admins) {
        await createNotification(serviceClient, {
          userId: admin.id,
          type: 'system',
          title: '미확인 정산 알림',
          message: `${yearMonth} 정산 중 ${pendingReports.length}건이 아직 최종 확인되지 않았습니다.`,
          link: '/admin/revenue',
        });
        adminNotifs++;
      }
    }

    return NextResponse.json({
      success: true,
      overdueCount: pendingReports.length,
      userNotifications: userNotifs,
      adminNotifications: adminNotifs,
      yearMonth,
    });
  } catch (err) {
    console.error('cron/admin-overdue error:', err);
    void logSystemError({ source: 'cron/admin-overdue', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
