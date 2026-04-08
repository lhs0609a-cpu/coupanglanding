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
  confirm_tax_invoice: '세금계산서 확인',
  approve_manual_input: '수동 입력 승인',
  reject_manual_input: '수동 입력 거절',
  create_penalty: '페널티 등록',
  resolve_penalty: '페널티 해결',
  create_challenge: '챌린지 생성',
  update_challenge: '챌린지 수정',
  award_points: '포인트 부여',
  create_notice: '공지사항 등록',
  update_notice: '공지사항 수정',
  delete_notice: '공지사항 삭제',
  reply_ticket: '문의 답변',
  close_ticket: '문의 종료',
  create_faq: 'FAQ 등록',
  update_faq: 'FAQ 수정',
  delete_faq: 'FAQ 삭제',
  create_screening: '스크리닝 링크 생성',
  decide_screening: '스크리닝 판정',
  create_pre_registration: '사전등록 생성',
  cancel_pre_registration: '사전등록 취소',
  auto_approve_user: '사용자 자동승인',
  reply_bug_report: '오류문의 답변',
  update_bug_report_status: '오류문의 상태 변경',
  close_bug_report: '오류문의 종료',
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
  manual_input_request: '수동 입력 요청',
  penalty_record: '페널티 기록',
  penalty_summary: '페널티 요약',
  seller_challenge: '아레나 챌린지',
  seller_points: '아레나 포인트',
  notice: '공지사항',
  support_ticket: '1:1 문의',
  ticket_message: '문의 메시지',
  faq: 'FAQ',
  screening_link: '스크리닝 링크',
  screening_result: '스크리닝 결과',
  pre_registration: '사전등록',
  bug_report: '오류문의',
  bug_report_message: '오류문의 메시지',
};
