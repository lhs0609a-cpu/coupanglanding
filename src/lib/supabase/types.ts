export type UserRole = 'admin' | 'partner' | 'pt_user';
export type PtStatus = 'active' | 'paused' | 'terminated';
export type PaymentStatus = 'pending' | 'submitted' | 'reviewed' | 'deposited' | 'confirmed' | 'rejected';
export type RevenueSource = 'pt' | 'program' | 'other';
export type ExpenseCategory = 'server' | 'ai_usage' | 'fixed' | 'tax' | 'marketing' | 'other';
export type ApplicationStatus = 'new' | 'contacted' | 'consulting' | 'converted' | 'rejected';
export type ContractStatus = 'draft' | 'sent' | 'signed' | 'expired' | 'terminated';
export type OnboardingStepStatus = 'pending' | 'submitted' | 'approved' | 'rejected';
export type OnboardingVerificationType = 'self_check' | 'evidence_upload' | 'auto_linked' | 'quiz';
export type FeePaymentStatus = 'not_applicable' | 'awaiting_payment' | 'paid' | 'overdue' | 'suspended';
export type NotificationType = 'report_status' | 'onboarding' | 'contract' | 'settlement' | 'system' | 'emergency' | 'violation' | 'arena' | 'fee_payment' | 'support' | 'trainer_message' | 'bug_report';
export type ActivityAction = 'approve_user' | 'reject_user' | 'confirm_deposit' | 'reject_report' | 'review_report' | 'undo_deposit' | 'send_contract' | 'terminate_contract' | 'approve_onboarding' | 'reject_onboarding' | 'confirm_distribution' | 'cancel_distribution' | 'update_settings' | 'create_revenue' | 'create_expense' | 'delete_revenue' | 'delete_expense' | 'approve_trainer' | 'revoke_trainer' | 'add_trainer' | 'link_trainee' | 'unlink_trainee' | 'request_withdrawal' | 'approve_withdrawal' | 'reject_withdrawal' | 'report_incident' | 'resolve_incident' | 'escalate_incident' | 'review_incident' | 'add_blacklist' | 'remove_blacklist' | 'create_violation' | 'update_violation' | 'escalate_violation' | 'resolve_violation' | 'dismiss_violation' | 'terminate_violation' | 'issue_tax_invoice' | 'cancel_tax_invoice' | 'confirm_tax_invoice' | 'approve_manual_input' | 'reject_manual_input' | 'create_penalty' | 'resolve_penalty' | 'create_challenge' | 'update_challenge' | 'award_points' | 'suspend_program_access' | 'restore_program_access' | 'create_notice' | 'update_notice' | 'delete_notice' | 'reply_ticket' | 'close_ticket' | 'create_faq' | 'update_faq' | 'delete_faq' | 'create_screening' | 'decide_screening' | 'create_pre_registration' | 'cancel_pre_registration' | 'auto_approve_user' | 'user_signup' | 'reply_bug_report' | 'update_bug_report_status' | 'close_bug_report';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';
export type TrainerStatus = 'pending' | 'approved' | 'revoked';
export type TrainerEarningStatus = 'pending' | 'requested' | 'deposited' | 'confirmed';
export type TrendSource = 'manual' | 'naver';
export type IncidentType = 'brand_complaint' | 'account_penalty';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'reported' | 'in_progress' | 'resolved' | 'escalated' | 'closed';
export type BlacklistRiskLevel = 'low' | 'warning' | 'high' | 'critical';
export type ComplaintType = 'trademark' | 'copyright' | 'authentic_cert' | 'parallel_import' | 'price_policy' | 'other';

// Violation types
export type ViolationCategory = 'settlement' | 'access_rights' | 'confidentiality' | 'operation' | 'other';
export type ViolationType = 'non_payment_3months' | 'false_revenue_report' | 'access_sharing' | 'credential_update_delay' | 'confidentiality_breach' | 'competing_service' | 'product_deactivation_fail' | 'blacklist_brand_sale' | 'seller_account_terminated' | 'other';
export type ViolationStatus = 'reported' | 'investigating' | 'dismissed' | 'action_taken' | 'resolved' | 'escalated' | 'terminated';
export type ViolationActionLevel = 'notice' | 'warning' | 'corrective' | 'termination';

// Tax Invoice types
export type TaxInvoiceStatus = 'issued' | 'confirmed' | 'cancelled';
export type ManualInputRequestStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  profile_id: string;
  display_name: string;
  bank_name: string;
  bank_account: string;
  share_ratio: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface PtUser {
  id: string;
  profile_id: string;
  share_percentage: number;
  status: PtStatus;
  program_access_active: boolean;
  coupang_seller_id: string | null;
  coupang_seller_pw: string | null;
  coupang_vendor_id: string | null;
  coupang_access_key: string | null;
  coupang_secret_key: string | null;
  coupang_api_connected: boolean;
  coupang_api_key_expires_at: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
  // 사업자 정보
  business_name: string | null;
  business_registration_number: string | null;
  business_representative: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  // 사업자 관계 (3자 계약)
  is_self_business: boolean;
  business_relation: string | null;
  // 테스트 계정 (결제/락/배너 전부 면제)
  is_test_account?: boolean;
  // 결제 락 관련 (옵셔널 — 마이그레이션 적용 전 row 호환)
  payment_lock_level?: number | null;
  payment_overdue_since?: string | null;
  admin_override_level?: number | null;
  payment_lock_exempt_until?: string | null;
  payment_retry_in_progress?: boolean;
  first_billing_grace_until?: string | null;
  // Joined fields
  profile?: Profile;
}

export interface ApiRevenueSnapshot {
  id: string;
  pt_user_id: string;
  year_month: string;
  total_sales: number;
  total_commission: number;
  total_shipping: number;
  total_returns: number;
  total_settlement: number;
  item_count: number;
  synced_at: string;
  sync_error: string | null;
  created_at: string;
}

export interface MonthlyReport {
  id: string;
  pt_user_id: string;
  year_month: string;
  reported_revenue: number;
  screenshot_url: string | null;
  calculated_deposit: number;
  payment_status: PaymentStatus;
  payment_confirmed_at: string | null;
  admin_deposit_amount: number | null;
  reviewed_at: string | null;
  deposited_at: string | null;
  admin_note: string | null;
  reject_reason: string | null;
  // 비용 항목
  cost_product: number;
  cost_commission: number;
  cost_advertising: number;
  cost_returns: number;
  cost_shipping: number;
  cost_tax: number;
  ad_screenshot_url: string | null;
  api_verified: boolean;
  api_settlement_data: Record<string, unknown> | null;
  // VAT 관련
  supply_amount: number;
  vat_amount: number;
  total_with_vat: number;
  // 입력 소스
  input_source: 'api' | 'manual_approved' | null;
  // 정산 구간 (첫 정산 합산)
  period_start: string | null;
  period_end: string | null;
  // 수수료 납부 추적
  fee_payment_status: FeePaymentStatus;
  fee_payment_deadline: string | null;
  fee_paid_at: string | null;
  fee_confirmed_at: string | null;
  fee_surcharge_amount: number;
  fee_interest_amount: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface RevenueEntry {
  id: string;
  year_month: string;
  source: RevenueSource;
  description: string;
  amount: number;
  main_partner_id: string | null;
  receipt_url: string | null;
  created_at: string;
  // Joined fields
  main_partner?: Partner;
}

export interface ExpenseEntry {
  id: string;
  year_month: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paid_by_partner_id: string | null;
  receipt_url: string | null;
  created_at: string;
  // Joined fields
  paid_by_partner?: Partner;
}

export interface DistributionSnapshot {
  id: string;
  year_month: string;
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  distribution_data: PartnerDistribution[];
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
}

export interface PartnerDistribution {
  partner_id: string;
  partner_name: string;
  share_ratio: number;
  revenue_share: number;
  expense_paid: number;
  expense_obligation: number;
  expense_settlement: number;
  final_amount: number;
  estimated_tax: number;
  after_tax: number;
}

export interface Application {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  category_interest: string | null;
  current_situation: string | null;
  coupang_experience: string | null;
  message: string | null;
  source: string;
  status: ApplicationStatus;
  admin_note: string | null;
  referral_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  pt_user_id: string;
  contract_type: string;
  terms: Record<string, unknown>;
  start_date: string;
  end_date: string | null;
  share_percentage: number;
  status: ContractStatus;
  signed_at: string | null;
  signed_ip: string | null;
  signature_data: string | null;
  admin_note: string | null;
  // 3자 계약 관련 필드
  contract_mode: 'single' | 'triple';
  business_signed_at: string | null;
  business_signature_data: string | null;
  business_signed_ip: string | null;
  business_signer_name: string | null;
  business_sign_token: string | null;
  business_sign_token_expires_at: string | null;
  // 해지 관련 필드
  terminated_at: string | null;
  termination_reason: string | null;
  product_deactivation_deadline: string | null;
  product_deactivation_confirmed: boolean;
  product_deactivation_evidence_url: string | null;
  termination_acknowledged_at: string | null;
  // 탈퇴 요청 관련 필드
  withdrawal_requested_at: string | null;
  withdrawal_reason: string | null;
  withdrawal_evidence_url: string | null;
  withdrawal_status: WithdrawalStatus | null;
  withdrawal_rejected_reason: string | null;
  withdrawal_approved_at: string | null;
  withdrawal_reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface OnboardingStep {
  id: string;
  pt_user_id: string;
  step_key: string;
  status: OnboardingStepStatus;
  evidence_url: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStepDefinition {
  key: string;
  order: number;
  label: string;
  description: string;
  verificationType: OnboardingVerificationType;
  autoLinkSource?: 'contract' | 'monthly_report';
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AdminActivityLog {
  id: string;
  admin_id: string;
  action: ActivityAction;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  // Joined
  admin_profile?: Profile;
}

export interface RecurringExpense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paid_by_partner_id: string | null;
  is_active: boolean;
  created_at: string;
  // Joined
  paid_by_partner?: Partner;
}

export interface Trainer {
  id: string;
  pt_user_id: string;
  referral_code: string | null;
  status: TrainerStatus;
  bonus_percentage: number;
  approved_at: string | null;
  total_earnings: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface TrainerTrainee {
  id: string;
  trainer_id: string;
  trainee_pt_user_id: string;
  application_id: string | null;
  is_active: boolean;
  linked_by: string | null;
  link_reason: string | null;
  link_type: 'referral' | 'manual';
  effective_from: string | null;
  created_at: string;
  // Joined fields
  trainer?: Trainer;
  trainee_pt_user?: PtUser;
}

export interface TrainerEarning {
  id: string;
  trainer_id: string;
  trainee_pt_user_id: string;
  monthly_report_id: string;
  year_month: string;
  trainee_net_profit: number;
  bonus_percentage: number;
  bonus_amount: number;
  payment_status: TrainerEarningStatus;
  created_at: string;
  // Joined fields
  trainer?: Trainer;
  trainee_pt_user?: PtUser;
}

export interface TrainerMessage {
  id: string;
  trainer_id: string;
  trainee_pt_user_id: string;
  message: string;
  template_key: string | null;
  is_read: boolean;
  sent_at: string;
}

export interface TrainerNote {
  id: string;
  trainer_id: string;
  trainee_pt_user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NaverKeywordData {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyAvePcClkCnt: number;
  monthlyAveMobileClkCnt: number;
  compIdx: string;
  plAvgDepth: number;
}

export interface TrendingKeyword {
  id: string;
  keyword: string;
  category: string;
  source: TrendSource;
  trend_score: number;
  naver_category_id: string | null;
  naver_trend_data: NaverKeywordData | null;
  naver_fetched_at: string | null;
  memo: string | null;
  is_active: boolean;
  created_by: string | null;
  // 소싱 인사이트 필드
  sourcing_tip: string | null;
  keyword_tip: string | null;
  seasonality: string | null;
  margin_range: string | null;
  difficulty: string | null;
  pros: string[];
  cons: string[];
  recommended_price_min: number | null;
  recommended_price_max: number | null;
  related_keywords: string[];
  product_count: number;
  competition_ratio: number;
  rank_daily: number | null;
  rank_weekly: number | null;
  collected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandBlacklist {
  id: string;
  brand_name: string;
  brand_name_en: string | null;
  category: string | null;
  risk_level: BlacklistRiskLevel;
  complaint_type: ComplaintType;
  description: string | null;
  reported_count: number;
  added_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Incident {
  id: string;
  pt_user_id: string;
  incident_type: IncidentType;
  sub_type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string | null;
  brand_name: string | null;
  product_name: string | null;
  coupang_reference: string | null;
  actions_taken: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface PartnerViolation {
  id: string;
  pt_user_id: string;
  violation_category: ViolationCategory;
  violation_type: ViolationType;
  status: ViolationStatus;
  action_level: ViolationActionLevel | null;
  title: string;
  description: string | null;
  evidence: string | null;
  contract_article: string | null;
  partner_response: string | null;
  partner_responded_at: string | null;
  correction_deadline: string | null;
  correction_completed_at: string | null;
  admin_notes: string | null;
  related_incident_id: string | null;
  reported_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface ViolationHistory {
  id: string;
  violation_id: string;
  previous_status: string | null;
  new_status: string;
  previous_action_level: string | null;
  new_action_level: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface ViolationSummary {
  pt_user_id: string;
  total_violations: number;
  active_violations: number;
  notice_count: number;
  warning_count: number;
  corrective_count: number;
  last_violation_at: string | null;
  risk_score: number;
  updated_at: string;
}

export interface TaxInvoice {
  id: string;
  invoice_number: string;
  monthly_report_id: string;
  pt_user_id: string;
  year_month: string;
  // 공급자 (회사)
  supplier_business_name: string;
  supplier_registration_number: string;
  supplier_representative: string;
  supplier_address: string;
  supplier_business_type: string;
  supplier_business_category: string;
  // 공급받는자 (PT 사용자)
  buyer_business_name: string;
  buyer_registration_number: string;
  buyer_representative: string;
  buyer_address: string;
  buyer_business_type: string;
  buyer_business_category: string;
  // 금액
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  // 상태
  status: TaxInvoiceStatus;
  issued_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  description: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
  monthly_report?: MonthlyReport;
}

export interface CompanySettings {
  id: string;
  business_name: string;
  business_registration_number: string;
  representative_name: string;
  business_address: string;
  business_type: string;
  business_category: string;
  email: string;
  phone: string;
  updated_at: string;
}

export interface ManualInputRequest {
  id: string;
  pt_user_id: string;
  year_month: string;
  reason: string;
  status: ManualInputRequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  requested_at: string;
  reviewed_at: string | null;
  // Joined fields
  pt_user?: PtUser;
}

// 페널티 트래커 타입
export type PenaltyCategory = 'delivery_delay' | 'cs_nonresponse' | 'return_rate_excess' | 'product_info_mismatch' | 'false_advertising';
export type PenaltyRiskLevel = 'safe' | 'caution' | 'warning' | 'danger';

export interface PenaltyRecord {
  id: string;
  pt_user_id: string;
  penalty_category: PenaltyCategory;
  title: string;
  description: string | null;
  occurred_at: string;
  score_impact: number;
  evidence_url: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
  reported_by: 'self' | 'admin';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface PenaltySummary {
  pt_user_id: string;
  total_records: number;
  active_records: number;
  delivery_delay_count: number;
  cs_nonresponse_count: number;
  return_rate_excess_count: number;
  product_info_mismatch_count: number;
  false_advertising_count: number;
  risk_score: number;
  risk_level: PenaltyRiskLevel;
  updated_at: string;
}

// 셀러 아레나 (게이미피케이션) 타입
export type ChallengeType = 'weekly' | 'monthly' | 'special';
export type ChallengeMetric = 'listings' | 'revenue' | 'streak' | 'points';
export type ActivityDataSource = 'manual' | 'api' | 'admin';

export interface SellerPoints {
  pt_user_id: string;
  anonymous_name: string | null;
  anonymous_emoji: string | null;
  total_points: number;
  current_level: number;
  streak_days: number;
  longest_streak: number;
  last_activity_date: string | null;
  total_listings: number;
  total_revenue: number;
  total_days_active: number;
  weekly_rank: number | null;
  monthly_rank: number | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface SellerDailyActivity {
  id: string;
  pt_user_id: string;
  activity_date: string;
  listings_count: number;
  revenue_amount: number;
  points_listings: number;
  points_revenue: number;
  points_streak: number;
  points_challenge: number;
  points_total: number;
  data_source: ActivityDataSource;
  created_at: string;
  updated_at: string;
}

export interface SellerAchievement {
  id: string;
  pt_user_id: string;
  achievement_key: string;
  unlocked_at: string;
}

export interface SellerChallenge {
  id: string;
  title: string;
  description: string | null;
  challenge_type: ChallengeType;
  metric: ChallengeMetric;
  target_value: number;
  reward_points: number;
  reward_badge: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface SellerChallengeProgress {
  id: string;
  challenge_id: string;
  pt_user_id: string;
  current_value: number;
  completed: boolean;
  completed_at: string | null;
  points_awarded: number;
}

// 키워드 트렌드 히스토리 (DataLab 캐시)
export interface TrendDataPoint {
  period: string;  // 날짜 문자열 (YYYY-MM-DD)
  ratio: number;   // 검색 비율 (0~100)
}

export interface KeywordTrendHistory {
  id: string;
  keyword: string;
  period_type: 'day' | 'week' | 'month';
  start_date: string;
  end_date: string;
  data_points: TrendDataPoint[];
  fetched_at: string;
  expires_at: string;
  created_at: string;
}

// 프로모션 (쿠폰 자동 적용) 타입
export type CouponType = 'instant' | 'download';
export type CouponDiscountType = 'RATE' | 'FIXED';
export type TrackingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
export type BulkApplyStatus = 'collecting' | 'applying' | 'completed' | 'failed' | 'cancelled';

export interface CouponAutoSyncConfig {
  id: string;
  pt_user_id: string;
  is_enabled: boolean;
  contract_id: string | null;
  // 즉시할인
  instant_coupon_enabled: boolean;
  instant_coupon_id: string | null;
  instant_coupon_name: string | null;
  instant_coupon_auto_create: boolean;
  instant_coupon_title_template: string | null;
  instant_coupon_duration_days: number;
  instant_coupon_discount: number;
  instant_coupon_discount_type: CouponDiscountType;
  instant_coupon_max_discount: number;
  instant_coupon_item_count: number; // 현재 쿠폰에 추가된 아이템 수 (로테이션용)
  // 다운로드
  download_coupon_enabled: boolean;
  download_coupon_id: string | null;
  download_coupon_name: string | null;
  download_coupon_auto_create: boolean;
  download_coupon_title_template: string | null;
  download_coupon_duration_days: number;
  download_coupon_policies: Record<string, unknown>[];
  // 옵션
  apply_delay_days: number;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCouponTracking {
  id: string;
  pt_user_id: string;
  seller_product_id: string;
  seller_product_name: string | null;
  vendor_item_id: string | null;
  status: TrackingStatus;
  instant_coupon_applied: boolean;
  download_coupon_applied: boolean;
  product_created_at: string | null;
  coupon_apply_scheduled_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponApplyLog {
  id: string;
  pt_user_id: string;
  coupon_type: CouponType;
  coupon_id: string | null;
  coupon_name: string | null;
  seller_product_id: string;
  vendor_item_id: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface BulkApplyProgress {
  id: string;
  pt_user_id: string;
  status: BulkApplyStatus;
  collecting_progress: number;
  applying_progress: number;
  total_products: number;
  total_items: number;
  instant_total: number;
  instant_success: number;
  instant_failed: number;
  download_total: number;
  download_success: number;
  download_failed: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// 고객센터 타입
export type NoticeCategory = 'system' | 'policy' | 'promotion' | 'education' | 'emergency';
export type TicketCategory = 'settlement' | 'contract' | 'coupang_api' | 'tax_invoice' | 'system_error' | 'other';
export type TicketStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high';
export type FaqCategory = 'signup' | 'settlement' | 'commission' | 'coupang_api' | 'tax_invoice' | 'penalty' | 'other';

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: NoticeCategory;
  is_pinned: boolean;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoticeRead {
  id: string;
  notice_id: string;
  profile_id: string;
  read_at: string;
}

export interface SupportTicket {
  id: string;
  pt_user_id: string;
  category: TicketCategory;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  // Joined fields
  pt_user?: PtUser;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  content: string;
  attachment_url: string | null;
  created_at: string;
}

export interface Faq {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

// 메가로드 오류문의 타입
export type BugReportCategory = 'ui_bug' | 'data_error' | 'api_error' | 'performance' | 'feature_request' | 'general';
export type BugReportStatus = 'pending' | 'confirmed' | 'in_progress' | 'resolved' | 'closed';
export type BugReportPriority = 'low' | 'normal' | 'high' | 'critical';

export interface BugReportAttachment {
  url: string;
  name: string;
  size: number;
}

export interface BugReport {
  id: string;
  megaload_user_id: string;
  title: string;
  description: string;
  category: BugReportCategory;
  status: BugReportStatus;
  priority: BugReportPriority;
  page_url: string | null;
  browser_info: string | null;
  screen_size: string | null;
  attachments: BugReportAttachment[];
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  megaload_user?: { id: string; profile_id: string; profile?: { id: string; full_name: string; email: string } | null };
  unread_count?: number;
}

export interface BugReportMessage {
  id: string;
  bug_report_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  content: string;
  attachments: BugReportAttachment[];
  is_read: boolean;
  created_at: string;
}

// 파트너 스크리닝 타입
export type ScreeningLinkStatus = 'pending' | 'completed' | 'expired';
export type ScreeningGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type ScreeningDecision = 'approved' | 'pending' | 'rejected' | 'hold';

export interface ScreeningLink {
  id: string;
  token: string;
  candidate_name: string;
  candidate_phone: string | null;
  candidate_memo: string | null;
  created_by: string;
  expires_at: string;
  status: ScreeningLinkStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  screening_result?: ScreeningResult;
}

export interface ScreeningResult {
  id: string;
  link_id: string;
  answers: Record<string, string>;
  total_score: number;
  grade: ScreeningGrade;
  category_scores: Record<string, unknown>[];
  red_flags: Record<string, unknown>[];
  yellow_flags: Record<string, unknown>[];
  green_flags: Record<string, unknown>[];
  consistency_warnings: Record<string, unknown>[];
  knockout_reasons: string[];
  time_spent_seconds: number;
  admin_decision: ScreeningDecision;
  admin_memo: string | null;
  respondent_ip: string | null;
  free_text_answer: string | null;
  created_at: string;
  updated_at: string;
}

// 사전등록
export type PreRegistrationStatus = 'pending' | 'used' | 'cancelled';
export interface PreRegistration {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  share_percentage: number;
  status: PreRegistrationStatus;
  memo: string | null;
  created_by: string;
  used_at: string | null;
  used_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

// 품절동기화 — 가격 자동 추종 (Auto Price Follow)
export type PriceFollowType = 'exact' | 'markup_amount' | 'markup_percent' | 'fixed_margin';
export type PriceFollowMode = 'auto' | 'manual_approval';

export interface PriceFollowRule {
  enabled: boolean;
  mode: PriceFollowMode;
  type: PriceFollowType;
  amount?: number;
  percent?: number;
  captured_margin?: number;
  min_price?: number;
  max_price?: number;
  min_change_pct?: number;
  max_change_pct?: number;
  follow_down?: boolean;
  cooldown_minutes?: number;
}

export interface PendingPriceChange {
  newPrice: number;
  oldPrice: number;
  sourcePrice: number;
  reason: string;
  detectedAt: string;
}

export type ShStockMonitorSourceStatus = 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error';
export type ShStockMonitorCoupangStatus = 'active' | 'suspended';

export interface ShStockMonitor {
  id: string;
  megaload_user_id: string;
  product_id: string;
  coupang_product_id: string;
  source_url: string;
  source_status: ShStockMonitorSourceStatus;
  coupang_status: ShStockMonitorCoupangStatus;
  registered_option_name: string | null;
  option_statuses: { optionName: string; status: 'in_stock' | 'sold_out' }[];
  consecutive_unknowns: number;
  consecutive_errors: number;
  is_active: boolean;
  check_interval_minutes: number;
  last_checked_at: string | null;
  last_changed_at: string | null;
  last_action_at: string | null;
  // 가격 추종
  price_follow_rule: PriceFollowRule | null;
  source_price_last: number | null;
  our_price_last: number | null;
  price_last_updated_at: string | null;
  price_last_applied_at: string | null;
  pending_price_change: PendingPriceChange | null;
  created_at: string;
  updated_at: string;
}

export type ShStockMonitorEventType =
  | 'source_sold_out' | 'source_restocked' | 'source_removed'
  | 'coupang_suspended' | 'coupang_resumed'
  | 'check_error' | 'check_ok'
  | 'price_changed_source' | 'price_updated_coupang'
  | 'price_update_skipped' | 'price_update_flagged'
  | 'price_update_failed' | 'price_update_pending'
  | 'price_approved' | 'price_rejected';

export interface ShStockMonitorLog {
  id: string;
  monitor_id: string;
  megaload_user_id: string;
  event_type: ShStockMonitorEventType;
  source_status_before: string | null;
  source_status_after: string | null;
  coupang_status_before: string | null;
  coupang_status_after: string | null;
  option_name: string | null;
  action_taken: string | null;
  action_success: boolean | null;
  error_message: string | null;
  source_price_before: number | null;
  source_price_after: number | null;
  our_price_before: number | null;
  our_price_after: number | null;
  price_skip_reason: string | null;
  created_at: string;
}

// 메가로드 반품 요청 (쿠팡 returnRequests API 연동)
export interface ShReturnRequest {
  id: string;
  megaload_user_id: string;
  channel: string;
  receipt_id: number;
  order_id: number;
  payment_id: number | null;
  receipt_type: string | null;
  receipt_status: string;
  requester_name: string | null;
  requester_phone: string | null;
  requester_address: string | null;
  requester_zip_code: string | null;
  reason_category1: string | null;
  reason_category2: string | null;
  reason_code: string | null;
  reason_code_text: string | null;
  cancel_count_sum: number | null;
  return_delivery_type: string | null;
  return_delivery_invoice_no: string | null;
  return_delivery_company_code: string | null;
  return_shipping_charge: number | null;
  fault_by_type: string | null;
  release_stop_status: string | null;
  product_name: string | null;
  option_name: string | null;
  release_status: string | null;
  channel_created_at: string | null;
  channel_modified_at: string | null;
  raw_data: Record<string, unknown>;
  invoice_registered_at: string | null;
  synced_at: string;
  updated_at: string;
}

// 토스페이먼츠 결제 타입
export type PaymentTransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled';
export type PaymentMethod = 'card' | 'manual_transfer';

export interface BillingCard {
  id: string;
  pt_user_id: string;
  customer_key: string;
  billing_key: string;
  card_company: string;
  card_number: string;
  card_type: string;
  is_active: boolean;
  is_primary: boolean;
  failed_count: number;
  registered_at: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  pt_user_id: string;
  monthly_report_id: string;
  billing_card_id: string | null;
  toss_payment_key: string | null;
  toss_order_id: string;
  amount: number;
  penalty_amount: number;
  total_amount: number;
  status: PaymentTransactionStatus;
  payment_method: PaymentMethod;
  is_auto_payment: boolean;
  receipt_url: string | null;
  raw_response: Record<string, unknown> | null;
  requested_at: string;
  approved_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  billing_card?: BillingCard;
  monthly_report?: MonthlyReport;
}

export interface PaymentSchedule {
  id: string;
  pt_user_id: string;
  auto_payment_enabled: boolean;
  billing_day: number;
  billing_card_id: string | null;
  total_success_count: number;
  total_failed_count: number;
  last_charged_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  billing_card?: BillingCard;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      partners: {
        Row: Partner;
        Insert: Omit<Partner, 'id' | 'created_at'>;
        Update: Partial<Omit<Partner, 'id' | 'created_at'>>;
      };
      pt_users: {
        Row: PtUser;
        Insert: Omit<PtUser, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PtUser, 'id' | 'created_at'>>;
      };
      monthly_reports: {
        Row: MonthlyReport;
        Insert: Omit<MonthlyReport, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MonthlyReport, 'id' | 'created_at'>>;
      };
      api_revenue_snapshots: {
        Row: ApiRevenueSnapshot;
        Insert: Omit<ApiRevenueSnapshot, 'id' | 'created_at'>;
        Update: Partial<Omit<ApiRevenueSnapshot, 'id' | 'created_at'>>;
      };
      revenue_entries: {
        Row: RevenueEntry;
        Insert: Omit<RevenueEntry, 'id' | 'created_at'>;
        Update: Partial<Omit<RevenueEntry, 'id' | 'created_at'>>;
      };
      expense_entries: {
        Row: ExpenseEntry;
        Insert: Omit<ExpenseEntry, 'id' | 'created_at'>;
        Update: Partial<Omit<ExpenseEntry, 'id' | 'created_at'>>;
      };
      distribution_snapshots: {
        Row: DistributionSnapshot;
        Insert: Omit<DistributionSnapshot, 'id' | 'created_at'>;
        Update: Partial<Omit<DistributionSnapshot, 'id' | 'created_at'>>;
      };
      applications: {
        Row: Application;
        Insert: Omit<Application, 'id' | 'created_at' | 'updated_at' | 'status'>;
        Update: Partial<Omit<Application, 'id' | 'created_at'>>;
      };
      contracts: {
        Row: Contract;
        Insert: Omit<Contract, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Contract, 'id' | 'created_at'>>;
      };
      onboarding_steps: {
        Row: OnboardingStep;
        Insert: Omit<OnboardingStep, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OnboardingStep, 'id' | 'created_at'>>;
      };
    };
  };
}
