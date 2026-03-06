import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityAction } from '@/lib/supabase/types';

interface LogParams {
  adminId: string;
  action: ActivityAction;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/** 관리자 활동 로그 기록 */
export async function logActivity(supabase: SupabaseClient, params: LogParams) {
  return supabase.from('admin_activity_logs').insert({
    admin_id: params.adminId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId || null,
    details: params.details || {},
  });
}

/** 활동 로그 액션 한글 라벨 */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  approve_user: '사용자 승인',
  reject_user: '사용자 거절',
  confirm_deposit: '송금 확인',
  reject_report: '매출 반려',
  review_report: '매출 검토',
  undo_deposit: '송금 취소',
  send_contract: '계약서 발송',
  terminate_contract: '계약 해지',
  approve_onboarding: '온보딩 승인',
  reject_onboarding: '온보딩 반려',
  confirm_distribution: '분배 확정',
  cancel_distribution: '분배 취소',
  update_settings: '설정 변경',
  create_revenue: '수익 등록',
  create_expense: '비용 등록',
  delete_revenue: '수익 삭제',
  delete_expense: '비용 삭제',
  approve_trainer: '트레이너 승인',
  revoke_trainer: '트레이너 취소',
  add_trainer: '트레이너 추가',
  link_trainee: '교육생 연결',
  request_withdrawal: '탈퇴 요청',
  approve_withdrawal: '탈퇴 승인',
  reject_withdrawal: '탈퇴 반려',
  report_incident: '인시던트 신고',
  resolve_incident: '인시던트 해결',
  escalate_incident: '인시던트 에스컬레이션',
  review_incident: '인시던트 리뷰',
  add_blacklist: '블랙리스트 추가',
  remove_blacklist: '블랙리스트 삭제',
  create_violation: '위반 등록',
  update_violation: '위반 상태 변경',
  escalate_violation: '위반 단계 격상',
  resolve_violation: '위반 시정 완료',
  dismiss_violation: '위반 무혐의',
  terminate_violation: '위반→계약해지',
  issue_tax_invoice: '세금계산서 발행',
  cancel_tax_invoice: '세금계산서 취소',
};

/** 대상 타입 한글 라벨 */
export const TARGET_TYPE_LABELS: Record<string, string> = {
  profile: '사용자',
  pt_user: 'PT 사용자',
  monthly_report: '매출 정산',
  contract: '계약서',
  onboarding_step: '온보딩',
  distribution: '분배',
  revenue_entry: '수익',
  expense_entry: '비용',
  settings: '설정',
  partner: '파트너',
  trainer: '트레이너',
  trainer_trainee: '교육생 연결',
  incident: '인시던트',
  brand_blacklist: '브랜드 블랙리스트',
  violation: '계약위반',
  violation_history: '위반 이력',
  tax_invoice: '세금계산서',
  company_settings: '회사 설정',
};
