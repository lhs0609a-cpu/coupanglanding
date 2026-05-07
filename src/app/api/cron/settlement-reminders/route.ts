import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';
import { getSettlementDDay, getReportTargetMonth } from '@/lib/utils/settlement';

export const maxDuration = 30;


/**
 * GET /api/cron/settlement-reminders
 *
 * Vercel Cron이 매일 00:00 KST에 호출
 * D-7, D-3, D-1, D-Day, D+1, D+3, D+7 에 미제출 유저에게 알림
 */
export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const yearMonth = getReportTargetMonth();
    const dday = getSettlementDDay(yearMonth);

    // 발송 대상 D-day 목록 (키를 문자열로 사용 — Turbopack이 음수 키 파싱 불가)
    const reminderSchedule: Record<string, { urgency: 'info' | 'warn' | 'urgent' | 'critical'; title: string; message: string }> = {
      '7':  { urgency: 'info',     title: '정산 마감 안내',     message: `${yearMonth} 매출 정산 마감까지 7일 남았습니다. 매출 보고서를 미리 준비해주세요.` },
      '3':  { urgency: 'warn',     title: '정산 마감 임박',     message: `${yearMonth} 매출 정산 마감까지 3일 남았습니다. 아직 미제출이시면 서둘러주세요.` },
      '1':  { urgency: 'urgent',   title: '내일 마감!',         message: `${yearMonth} 매출 정산이 내일 마감됩니다! 반드시 오늘 중으로 제출해주세요.` },
      '0':  { urgency: 'critical', title: '오늘 마감입니다',    message: `${yearMonth} 매출 정산이 오늘 자정에 마감됩니다. 미제출 시 정산이 지연됩니다.` },
      '-1': { urgency: 'critical', title: '마감일 초과',        message: `${yearMonth} 매출 정산 마감이 1일 지났습니다. 즉시 제출해주세요.` },
      '-3': { urgency: 'critical', title: '마감 3일 초과 경고', message: `${yearMonth} 매출 정산 마감이 3일 지났습니다. 빠르게 제출하지 않으면 불이익이 발생할 수 있습니다.` },
      '-7': { urgency: 'critical', title: '마감 7일 초과 — 관리자 통보', message: `${yearMonth} 매출 정산 마감이 7일 초과되었습니다. 관리자에게 자동 보고되었으며, 즉시 제출해주세요.` },
    };

    const schedule = reminderSchedule[String(dday)];
    if (!schedule) {
      return NextResponse.json({
        success: true,
        sent: 0,
        dday,
        message: `D-day ${dday}은 발송 대상이 아닙니다.`,
      });
    }

    const serviceClient = await createServiceClient();

    // 활성 PT 유저 조회
    const { data: activePtUsers, error: ptError } = await serviceClient
      .from('pt_users')
      .select('id, profile_id')
      .eq('status', 'active');

    if (ptError || !activePtUsers?.length) {
      return NextResponse.json({ success: true, sent: 0, message: '활성 PT 사용자가 없습니다.' });
    }

    // 이미 제출한 유저 제외
    const { data: existingReports } = await serviceClient
      .from('monthly_reports')
      .select('pt_user_id')
      .eq('year_month', yearMonth);

    const submittedIds = new Set(
      (existingReports || []).map((r: { pt_user_id: string }) => r.pt_user_id)
    );

    const unsubmitted = activePtUsers.filter(
      (u: { id: string; profile_id: string }) => !submittedIds.has(u.id)
    );

    if (unsubmitted.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: '모든 유저가 제출 완료.' });
    }

    // 미제출 유저에게 알림
    let sentCount = 0;
    for (const user of unsubmitted) {
      const { profile_id } = user as { id: string; profile_id: string };
      await createNotification(serviceClient, {
        userId: profile_id,
        type: 'settlement',
        title: schedule.title,
        message: schedule.message,
        link: '/my/report',
      });
      sentCount++;
    }

    // D+7: 관리자에게도 미제출자 목록 알림
    if (dday === -7) {
      const { data: admins } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins?.length) {
        for (const admin of admins) {
          await createNotification(serviceClient, {
            userId: admin.id,
            type: 'system',
            title: '정산 미제출자 7일 초과',
            message: `${yearMonth} 매출 정산을 7일 이상 미제출한 회원이 ${unsubmitted.length}명입니다. 확인이 필요합니다.`,
            link: '/admin/revenue',
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      dday,
      yearMonth,
      urgency: schedule.urgency,
    });
  } catch (err) {
    console.error('cron/settlement-reminders error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
