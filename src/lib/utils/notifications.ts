import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from '@/lib/supabase/types';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/** 서비스 클라이언트로 알림 생성 */
export async function createNotification(
  supabase: SupabaseClient,
  params: CreateNotificationParams,
) {
  return supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link || null,
  });
}

/** 여러 사용자에게 동시 알림 */
export async function createBulkNotifications(
  supabase: SupabaseClient,
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>,
) {
  const rows = userIds.map((userId) => ({
    user_id: userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link || null,
  }));
  return supabase.from('notifications').insert(rows);
}

/** 매출 정산 상태 변경 알림 생성 */
export async function notifyReportStatusChange(
  supabase: SupabaseClient,
  userId: string,
  yearMonth: string,
  newStatus: string,
) {
  const statusMessages: Record<string, { title: string; message: string }> = {
    reviewed: {
      title: '매출 확인 완료 - 송금 대기중',
      message: `${yearMonth} 매출이 관리자에 의해 확인되었습니다. 확정 송금액을 확인하고 송금완료 신청해주세요.`,
    },
    rejected: {
      title: '매출 정산 반려',
      message: `${yearMonth} 매출 정산이 반려되었습니다. 사유를 확인하고 다시 제출해주세요.`,
    },
    confirmed: {
      title: '정산 완료',
      message: `${yearMonth} 정산이 완료되었습니다.`,
    },
  };

  const info = statusMessages[newStatus];
  if (!info) return;

  return createNotification(supabase, {
    userId,
    type: 'report_status',
    title: info.title,
    message: info.message,
    link: '/my/report',
  });
}

/** 온보딩 승인/반려 알림 */
export async function notifyOnboardingResult(
  supabase: SupabaseClient,
  userId: string,
  stepLabel: string,
  approved: boolean,
  reason?: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'onboarding',
    title: approved ? '온보딩 단계 승인' : '온보딩 단계 반려',
    message: approved
      ? `"${stepLabel}" 단계가 승인되었습니다.`
      : `"${stepLabel}" 단계가 반려되었습니다.${reason ? ` 사유: ${reason}` : ''}`,
    link: '/my/dashboard',
  });
}

/** 정산 마감 리마인더 알림 */
export async function notifySettlementReminder(
  supabase: SupabaseClient,
  userId: string,
  yearMonth: string,
  daysLeft: number,
) {
  return createNotification(supabase, {
    userId,
    type: 'settlement',
    title: '정산 마감 임박',
    message: `${yearMonth} 매출 정산 마감이 ${daysLeft}일 남았습니다. 아직 제출하지 않으셨다면 서둘러 주세요.`,
    link: '/my/report',
  });
}
