import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';
import { getSettlementDDay, getReportTargetMonth } from '@/lib/utils/settlement';

export async function POST(request: NextRequest) {
  try {
    // 1. 요청자가 admin인지 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    // 2. yearMonth 파라미터 (없으면 현재 보고 대상 월)
    const body = await request.json();
    const yearMonth: string = body.yearMonth || getReportTargetMonth();

    // 3. D-day 확인 (3일, 1일, 0일만 리마인더 발송)
    const dday = getSettlementDDay(yearMonth);
    const shouldRemind = dday === 3 || dday === 1 || dday === 0;

    if (!shouldRemind) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: `D-day ${dday}일은 리마인더 발송 대상이 아닙니다. (D-3, D-1, D-Day만 발송)`,
      });
    }

    // 4. Service client로 전체 PT 사용자 조회
    const serviceClient = await createServiceClient();

    const { data: activePtUsers, error: ptError } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, created_at')
      .eq('status', 'active');

    if (ptError) {
      return NextResponse.json({ error: `PT 사용자 조회 실패: ${ptError.message}` }, { status: 500 });
    }

    if (!activePtUsers || activePtUsers.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: '활성 PT 사용자가 없습니다.' });
    }

    // 5. 해당 월에 이미 보고서를 제출한 PT 사용자 조회
    const { data: existingReports, error: reportError } = await serviceClient
      .from('monthly_reports')
      .select('pt_user_id')
      .eq('year_month', yearMonth);

    if (reportError) {
      return NextResponse.json({ error: `보고서 조회 실패: ${reportError.message}` }, { status: 500 });
    }

    const submittedUserIds = new Set(
      (existingReports || []).map((r: { pt_user_id: string }) => r.pt_user_id)
    );

    // 6. 미제출 사용자 필터링
    const unsubmittedUsers = activePtUsers.filter(
      (u: { id: string; profile_id: string; created_at: string }) => !submittedUserIds.has(u.id)
    );

    if (unsubmittedUsers.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: '모든 PT 사용자가 이미 보고서를 제출했습니다.',
      });
    }

    // 7. 각 미제출 사용자에게 리마인더 알림 생성
    let sentCount = 0;
    const errors: string[] = [];

    for (const ptUser of unsubmittedUsers) {
      const { profile_id } = ptUser as { id: string; profile_id: string; created_at: string };

      const ddayText =
        dday === 0 ? '오늘이 마감일입니다!' :
        `마감까지 ${dday}일 남았습니다.`;

      const { error: notifError } = await createNotification(serviceClient, {
        userId: profile_id,
        type: 'settlement',
        title: '정산 마감 임박 알림',
        message: `${yearMonth} 매출 정산을 아직 제출하지 않으셨습니다. ${ddayText} 서둘러 제출해 주세요.`,
        link: '/my/report',
      });

      if (notifError) {
        errors.push(`${profile_id}: ${notifError.message}`);
      } else {
        sentCount++;
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      total: unsubmittedUsers.length,
      dday,
      yearMonth,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('settlement-reminders error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
