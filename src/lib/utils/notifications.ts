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

/** 정산 마감 지연 리마인더 알림 (D+N) */
export async function notifySettlementOverdue(
  supabase: SupabaseClient,
  userId: string,
  yearMonth: string,
  daysOverdue: number,
) {
  return createNotification(supabase, {
    userId,
    type: 'settlement',
    title: '정산 마감 초과',
    message: `${yearMonth} 매출 정산 마감이 ${daysOverdue}일 지났습니다. 빠르게 제출해주세요.`,
    link: '/my/report',
  });
}

/** 관리자 정산 지연 알림 (사용자에게) */
export async function notifyAdminSettlementDelay(
  supabase: SupabaseClient,
  userId: string,
  yearMonth: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'settlement',
    title: '정산 처리 안내',
    message: `${yearMonth} 정산이 관리자 확인 대기 중입니다. 처리가 지연되고 있어 빠르게 확인될 예정입니다.`,
    link: '/my/report',
  });
}

/** 관리자에게 미확인 정산 경고 알림 */
export async function notifyAdminOverdueAlert(
  supabase: SupabaseClient,
  adminId: string,
  overdueCount: number,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'system',
    title: '미확인 정산 경고',
    message: `${overdueCount}건의 정산 확인이 마감일을 초과했습니다. 빠르게 처리해주세요.`,
    link: '/admin/dashboard',
  });
}

/** 계약 해지 알림 (사용자에게) */
export async function notifyContractTermination(
  supabase: SupabaseClient,
  userId: string,
  terminationDate: string,
  deadline: string,
  reason: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'contract',
    title: '계약이 해지되었습니다',
    message: `계약이 ${terminationDate}부로 해지되었습니다. 사유: ${reason}. 등록한 모든 상품을 ${deadline}까지 비활성화해야 합니다.`,
    link: '/my/contract',
  });
}

/** 상품 철거 리마인더 (사용자에게) */
export async function notifyDeactivationReminder(
  supabase: SupabaseClient,
  userId: string,
  daysLeft: number,
  deadline: string,
) {
  const urgency = daysLeft <= 0 ? '기한이 초과되었습니다!' : `${daysLeft}일 남았습니다.`;
  return createNotification(supabase, {
    userId,
    type: 'contract',
    title: '상품 철거 기한 안내',
    message: `상품 비활성화 기한(${deadline})까지 ${urgency} 쿠팡 Wing에서 모든 상품을 판매중지해주세요.`,
    link: '/my/contract',
  });
}

/** 트레이너에게 새 교육생 연결 알림 */
export async function notifyTrainerNewTrainee(
  supabase: SupabaseClient,
  trainerProfileId: string,
  traineeName: string,
) {
  return createNotification(supabase, {
    userId: trainerProfileId,
    type: 'system',
    title: '새 교육생 연결',
    message: `새 교육생 "${traineeName}"이(가) 연결되었습니다.`,
    link: '/my/dashboard',
  });
}

/** 관리자에게 트레이너 입금요청 알림 */
export async function notifyAdminBonusRequested(
  supabase: SupabaseClient,
  adminId: string,
  trainerName: string,
  amount: number,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'system',
    title: '트레이너 입금요청',
    message: `트레이너 "${trainerName}"이(가) 보너스 ${amount.toLocaleString()}원의 입금을 요청했습니다.`,
    link: '/admin/trainers',
  });
}

/** 트레이너에게 입금완료(확인요망) 알림 */
export async function notifyTrainerBonusDeposited(
  supabase: SupabaseClient,
  trainerProfileId: string,
  yearMonth: string,
  amount: number,
) {
  return createNotification(supabase, {
    userId: trainerProfileId,
    type: 'system',
    title: '보너스 입금완료 - 확인요망',
    message: `${yearMonth} 보너스 ${amount.toLocaleString()}원이 입금되었습니다. 입금을 확인해주세요.`,
    link: '/my/trainer',
  });
}

/** 관리자에게 트레이너 입금확인 완료 알림 */
export async function notifyAdminBonusConfirmed(
  supabase: SupabaseClient,
  adminId: string,
  trainerName: string,
  amount: number,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'system',
    title: '트레이너 입금확인 완료',
    message: `트레이너 "${trainerName}"이(가) 보너스 ${amount.toLocaleString()}원의 입금을 확인했습니다.`,
    link: '/admin/trainers',
  });
}

/** 트레이너에게 보너스 발생 알림 */
export async function notifyTrainerBonusEarned(
  supabase: SupabaseClient,
  trainerProfileId: string,
  traineeName: string,
  yearMonth: string,
  bonusAmount: number,
) {
  return createNotification(supabase, {
    userId: trainerProfileId,
    type: 'system',
    title: '트레이너 보너스 발생',
    message: `${yearMonth} "${traineeName}" 교육생의 정산으로 보너스 ${bonusAmount.toLocaleString()}원이 발생했습니다.`,
    link: '/my/dashboard',
  });
}

/** 트레이너 자격 승인 알림 */
export async function notifyTrainerApproved(
  supabase: SupabaseClient,
  trainerProfileId: string,
  referralCode: string,
) {
  return createNotification(supabase, {
    userId: trainerProfileId,
    type: 'system',
    title: '트레이너 자격 승인',
    message: `트레이너 자격이 승인되었습니다. 추천 코드: ${referralCode}`,
    link: '/my/dashboard',
  });
}

/** 파트너 탈퇴 요청 알림 (관리자에게) */
export async function notifyWithdrawalRequested(
  supabase: SupabaseClient,
  adminId: string,
  partnerName: string,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'contract',
    title: '파트너 탈퇴 요청',
    message: `"${partnerName}" 파트너가 계약 탈퇴를 요청했습니다. 심사가 필요합니다.`,
    link: '/admin/contracts',
  });
}

/** 탈퇴 승인 알림 (파트너에게) */
export async function notifyWithdrawalApproved(
  supabase: SupabaseClient,
  userId: string,
  deadline: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'contract',
    title: '탈퇴 요청이 승인되었습니다',
    message: `계약 탈퇴가 승인되었습니다. ${deadline}까지 모든 상품을 비활성화해주세요.`,
    link: '/my/contract',
  });
}

/** 탈퇴 반려 알림 (파트너에게) */
export async function notifyWithdrawalRejected(
  supabase: SupabaseClient,
  userId: string,
  reason: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'contract',
    title: '탈퇴 요청이 반려되었습니다',
    message: `탈퇴 요청이 반려되었습니다. 사유: ${reason}`,
    link: '/my/contract',
  });
}

/** 인시던트 신고 알림 (관리자에게) */
export async function notifyIncidentReported(
  supabase: SupabaseClient,
  adminId: string,
  partnerName: string,
  incidentTitle: string,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'emergency',
    title: '긴급 인시던트 신고',
    message: `"${partnerName}" 파트너가 "${incidentTitle}" 인시던트를 신고했습니다.`,
    link: '/admin/emergency',
  });
}

/** 인시던트 상태 변경 알림 (파트너에게) */
export async function notifyIncidentStatusChange(
  supabase: SupabaseClient,
  userId: string,
  incidentTitle: string,
  newStatus: string,
  note?: string,
) {
  const statusLabels: Record<string, string> = {
    in_progress: '처리 중',
    resolved: '해결됨',
    escalated: '에스컬레이션',
    closed: '종료',
  };
  return createNotification(supabase, {
    userId,
    type: 'emergency',
    title: `인시던트 상태 변경: ${statusLabels[newStatus] || newStatus}`,
    message: `"${incidentTitle}" 인시던트가 ${statusLabels[newStatus] || newStatus} 상태로 변경되었습니다.${note ? ` 메모: ${note}` : ''}`,
    link: '/my/emergency',
  });
}

/** 블랙리스트 추가 알림 (전체 파트너에게) */
export async function notifyBlacklistAdded(
  supabase: SupabaseClient,
  userId: string,
  brandName: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'emergency',
    title: '브랜드 블랙리스트 추가',
    message: `"${brandName}" 브랜드가 블랙리스트에 추가되었습니다. 해당 브랜드 상품 판매에 주의해주세요.`,
    link: '/my/emergency',
  });
}

/** 계약위반 등록 알림 (파트너에게) */
export async function notifyViolationCreated(
  supabase: SupabaseClient,
  userId: string,
  violationTitle: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'violation',
    title: '계약위반 사항이 접수되었습니다',
    message: `"${violationTitle}" 건이 접수되었습니다. 상세 내용을 확인하고 소명 기회를 활용해주세요.`,
    link: '/my/violations',
  });
}

/** 위반 조사 개시 알림 (파트너에게) */
export async function notifyViolationInvestigating(
  supabase: SupabaseClient,
  userId: string,
  violationTitle: string,
) {
  return createNotification(supabase, {
    userId,
    type: 'violation',
    title: '위반 건 조사가 시작되었습니다',
    message: `"${violationTitle}" 건의 조사가 시작되었습니다. 소명서를 제출해주세요.`,
    link: '/my/violations',
  });
}

/** 위반 조치 결정 알림 (파트너에게) */
export async function notifyViolationActionTaken(
  supabase: SupabaseClient,
  userId: string,
  violationTitle: string,
  actionLevel: string,
  correctionDeadline?: string,
) {
  const actionLabels: Record<string, string> = {
    notice: '주의',
    warning: '경고',
    corrective: '시정명령',
    termination: '계약해지',
  };
  const action = actionLabels[actionLevel] || actionLevel;
  const deadlineText = correctionDeadline
    ? ` 시정 기한: ${new Date(correctionDeadline).toLocaleDateString('ko-KR')}`
    : '';

  return createNotification(supabase, {
    userId,
    type: 'violation',
    title: `계약위반 조치: ${action}`,
    message: `"${violationTitle}" 건에 대해 ${action} 조치가 부과되었습니다.${deadlineText}`,
    link: '/my/violations',
  });
}

/** 시정 기한 임박 알림 (파트너에게) */
export async function notifyViolationDeadlineApproaching(
  supabase: SupabaseClient,
  userId: string,
  violationTitle: string,
  daysLeft: number,
) {
  return createNotification(supabase, {
    userId,
    type: 'violation',
    title: '시정 기한 임박',
    message: `"${violationTitle}" 건의 시정 기한이 ${daysLeft}일 남았습니다.`,
    link: '/my/violations',
  });
}

/** 시정 기한 초과 알림 (관리자에게) */
export async function notifyViolationDeadlineOverdue(
  supabase: SupabaseClient,
  adminId: string,
  partnerName: string,
  violationTitle: string,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'violation',
    title: '시정 기한 초과',
    message: `"${partnerName}" 파트너의 "${violationTitle}" 건 시정 기한이 초과되었습니다.`,
    link: '/admin/violations',
  });
}

/** 위반 무혐의/시정완료 알림 (파트너에게) */
export async function notifyViolationResolved(
  supabase: SupabaseClient,
  userId: string,
  violationTitle: string,
  dismissed: boolean,
) {
  return createNotification(supabase, {
    userId,
    type: 'violation',
    title: dismissed ? '위반 건 무혐의 종결' : '시정 완료 확인',
    message: dismissed
      ? `"${violationTitle}" 건이 무혐의로 종결되었습니다.`
      : `"${violationTitle}" 건의 시정이 완료 처리되었습니다.`,
    link: '/my/violations',
  });
}

/** 상품 철거 증빙 제출 알림 (관리자에게) */
export async function notifyDeactivationSubmitted(
  supabase: SupabaseClient,
  adminId: string,
  userId: string,
  contractId: string,
) {
  return createNotification(supabase, {
    userId: adminId,
    type: 'contract',
    title: '상품 철거 증빙 제출됨',
    message: `사용자가 상품 비활성화 증빙을 제출했습니다. 확인해주세요.`,
    link: '/admin/contracts',
  });
}
