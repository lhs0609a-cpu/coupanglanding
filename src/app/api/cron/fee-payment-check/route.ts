import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';
import {
  getFeePaymentDDay,
  calculateFeePenalty,
  SUSPENSION_DAYS,
  GRACE_PERIOD_DAYS,
} from '@/lib/utils/fee-penalty';
import {
  notifyFeePaymentReminder,
  notifyFeeGracePeriodReminder,
  notifyFeePaymentOverdue,
  notifyProgramSuspension,
} from '@/lib/utils/notifications';
import { logActivity } from '@/lib/utils/activity-log';
import { getBillingExcludedPtUserIds } from '@/lib/payments/billing-exclusion-guard';

export const maxDuration = 30;


/**
 * GET /api/cron/fee-payment-check
 *
 * 매일 실행:
 * 1. awaiting_payment → overdue 자동 전환 (마감일 초과 시)
 * 2. overdue + D+14 → suspended 전환 + program_access_active = false
 * 3. 페널티 금액 계산 & 저장
 * 4. 리마인더 알림 (D-7, D-3, D-1)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();
    let remindersSent = 0;
    let overdueTransitions = 0;
    let suspensions = 0;
    let billingExcludedSkipped = 0;

    // 결제 제외 활성 PT생은 cron 처리에서 완전 제외.
    // 그 사람들의 awaiting_payment 보고서를 overdue/suspended 로 전환하면 안 됨
    // (자동결제 자체를 면제했으니 연체로 처리하는 건 정책 위반).
    const excludedPtUserIds = await getBillingExcludedPtUserIds(serviceClient);

    // 1. awaiting_payment 리포트 조회
    const { data: awaitingReports } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, year_month, total_with_vat, fee_payment_deadline')
      .eq('fee_payment_status', 'awaiting_payment');

    for (const report of (awaitingReports || [])) {
      if (!report.fee_payment_deadline) continue;
      // 청구액 0원(수수료율 0%/순이익≤0)은 낼 게 없으므로 연체/정지 대상 아님 → 락 방지.
      if ((report.total_with_vat || 0) <= 0) {
        await serviceClient
          .from('monthly_reports')
          .update({ fee_payment_status: 'paid', fee_paid_at: new Date().toISOString() })
          .eq('id', report.id);
        continue;
      }
      if (excludedPtUserIds.has(report.pt_user_id)) {
        billingExcludedSkipped++;
        continue;
      }

      const dday = getFeePaymentDDay(report.fee_payment_deadline);

      // 리마인더 알림 (D-7, D-3, D-1)
      if ([7, 3, 1].includes(dday)) {
        const { data: ptUser } = await serviceClient
          .from('pt_users')
          .select('profile_id')
          .eq('id', report.pt_user_id)
          .single();

        if (ptUser) {
          await notifyFeePaymentReminder(
            serviceClient,
            ptUser.profile_id,
            report.year_month,
            dday,
          );
          remindersSent++;
        }
      }

      // 마감일 초과 → overdue 전환 (유예 기간 중에는 페널티 0)
      if (dday < 0) {
        const daysOverdue = Math.abs(dday);
        const penalty = calculateFeePenalty(report.total_with_vat || 0, daysOverdue);

        await serviceClient
          .from('monthly_reports')
          .update({
            fee_payment_status: 'overdue',
            fee_surcharge_amount: penalty.surchargeAmount,
            fee_interest_amount: penalty.interestAmount,
          })
          .eq('id', report.id);

        overdueTransitions++;

        // 유예 기간 리마인더 (D+3, D+7)
        if ([3, 7].includes(daysOverdue)) {
          const { data: ptUser } = await serviceClient
            .from('pt_users')
            .select('profile_id')
            .eq('id', report.pt_user_id)
            .single();

          if (ptUser) {
            await notifyFeeGracePeriodReminder(
              serviceClient,
              ptUser.profile_id,
              report.year_month,
              daysOverdue,
              GRACE_PERIOD_DAYS - daysOverdue,
            );
            remindersSent++;
          }
        }

        // 유예 기간 초과 시 연체 경고 알림
        if (daysOverdue > GRACE_PERIOD_DAYS) {
          const { data: ptUser } = await serviceClient
            .from('pt_users')
            .select('profile_id')
            .eq('id', report.pt_user_id)
            .single();

          if (ptUser) {
            await notifyFeePaymentOverdue(
              serviceClient,
              ptUser.profile_id,
              report.year_month,
              daysOverdue,
            );
          }
        }
      }
    }

    // 2. overdue 리포트 조회 → 페널티 갱신 + 접근 정지 판단
    const { data: overdueReports } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, year_month, total_with_vat, fee_payment_deadline')
      .eq('fee_payment_status', 'overdue');

    for (const report of (overdueReports || [])) {
      if (!report.fee_payment_deadline) continue;
      // 0원 청구는 정지(락) 대상 아님 → 자동 종결.
      if ((report.total_with_vat || 0) <= 0) {
        await serviceClient
          .from('monthly_reports')
          .update({ fee_payment_status: 'paid', fee_paid_at: new Date().toISOString() })
          .eq('id', report.id);
        continue;
      }
      if (excludedPtUserIds.has(report.pt_user_id)) {
        billingExcludedSkipped++;
        continue;
      }

      const dday = getFeePaymentDDay(report.fee_payment_deadline);
      const daysOverdue = Math.abs(dday);
      const penalty = calculateFeePenalty(report.total_with_vat || 0, daysOverdue);

      // D+14 이상 → suspended 전환
      if (daysOverdue >= SUSPENSION_DAYS) {
        await serviceClient
          .from('monthly_reports')
          .update({
            fee_payment_status: 'suspended',
            fee_surcharge_amount: penalty.surchargeAmount,
            fee_interest_amount: penalty.interestAmount,
          })
          .eq('id', report.id);

        // 프로그램 접근 정지
        await serviceClient
          .from('pt_users')
          .update({ program_access_active: false })
          .eq('id', report.pt_user_id);

        suspensions++;

        // 접근 정지 알림
        const { data: ptUser } = await serviceClient
          .from('pt_users')
          .select('profile_id')
          .eq('id', report.pt_user_id)
          .single();

        if (ptUser) {
          await notifyProgramSuspension(
            serviceClient,
            ptUser.profile_id,
            report.year_month,
          );
        }

        // 관리자에게 로그
        const { data: admins } = await serviceClient
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .limit(1);

        if (admins?.[0]) {
          await logActivity(serviceClient, {
            adminId: admins[0].id,
            action: 'suspend_program_access',
            targetType: 'pt_user',
            targetId: report.pt_user_id,
            details: {
              year_month: report.year_month,
              days_overdue: daysOverdue,
              total_due: penalty.totalDue,
            },
          });
        }
      } else {
        // 페널티 금액 갱신 (유예 기간 중에는 calculateFeePenalty가 0을 반환)
        await serviceClient
          .from('monthly_reports')
          .update({
            fee_surcharge_amount: penalty.surchargeAmount,
            fee_interest_amount: penalty.interestAmount,
          })
          .eq('id', report.id);

        // 유예 기간 리마인더 (D+3, D+7)
        if (daysOverdue <= GRACE_PERIOD_DAYS && [3, 7].includes(daysOverdue)) {
          const { data: ptUser } = await serviceClient
            .from('pt_users')
            .select('profile_id')
            .eq('id', report.pt_user_id)
            .single();

          if (ptUser) {
            await notifyFeeGracePeriodReminder(
              serviceClient,
              ptUser.profile_id,
              report.year_month,
              daysOverdue,
              GRACE_PERIOD_DAYS - daysOverdue,
            );
            remindersSent++;
          }
        }

        // 유예 기간 초과 시 연체 경고 알림 (매일)
        if (daysOverdue > GRACE_PERIOD_DAYS) {
          const { data: ptUser } = await serviceClient
            .from('pt_users')
            .select('profile_id')
            .eq('id', report.pt_user_id)
            .single();

          if (ptUser) {
            await notifyFeePaymentOverdue(
              serviceClient,
              ptUser.profile_id,
              report.year_month,
              daysOverdue,
            );
            remindersSent++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      remindersSent,
      overdueTransitions,
      suspensions,
      billingExcludedSkipped,
    });
  } catch (err) {
    console.error('cron/fee-payment-check error:', err);
    void logSystemError({ source: 'cron/fee-payment-check', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
