export type UserRole = 'admin' | 'partner' | 'pt_user';
export type PtStatus = 'active' | 'paused' | 'terminated';
export type PaymentStatus = 'pending' | 'submitted' | 'reviewed' | 'deposited' | 'confirmed' | 'rejected';
export type RevenueSource = 'pt' | 'program' | 'other';
export type ExpenseCategory = 'server' | 'ai_usage' | 'fixed' | 'tax' | 'marketing' | 'other';
export type ApplicationStatus = 'new' | 'contacted' | 'consulting' | 'converted' | 'rejected';
export type ContractStatus = 'draft' | 'sent' | 'signed' | 'expired' | 'terminated';
export type OnboardingStepStatus = 'pending' | 'submitted' | 'approved' | 'rejected';
export type OnboardingVerificationType = 'self_check' | 'evidence_upload' | 'auto_linked' | 'quiz';
export type NotificationType = 'report_status' | 'onboarding' | 'contract' | 'settlement' | 'system' | 'emergency';
export type ActivityAction = 'approve_user' | 'reject_user' | 'confirm_deposit' | 'reject_report' | 'review_report' | 'undo_deposit' | 'send_contract' | 'terminate_contract' | 'approve_onboarding' | 'reject_onboarding' | 'confirm_distribution' | 'cancel_distribution' | 'update_settings' | 'create_revenue' | 'create_expense' | 'delete_revenue' | 'delete_expense' | 'approve_trainer' | 'revoke_trainer' | 'add_trainer' | 'link_trainee' | 'request_withdrawal' | 'approve_withdrawal' | 'reject_withdrawal' | 'report_incident' | 'resolve_incident' | 'escalate_incident' | 'review_incident' | 'add_blacklist' | 'remove_blacklist';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';
export type TrainerStatus = 'pending' | 'approved' | 'revoked';
export type TrainerEarningStatus = 'pending' | 'requested' | 'deposited' | 'confirmed';
export type TrendSource = 'manual' | 'naver';
export type IncidentType = 'brand_complaint' | 'account_penalty';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'reported' | 'in_progress' | 'resolved' | 'escalated' | 'closed';
export type BlacklistRiskLevel = 'low' | 'warning' | 'high' | 'critical';
export type ComplaintType = 'trademark' | 'copyright' | 'authentic_cert' | 'parallel_import' | 'price_policy' | 'other';

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
  created_at: string;
  updated_at: string;
  // Joined fields
  profile?: Profile;
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
