export type UserRole = 'admin' | 'partner' | 'pt_user';
export type PtStatus = 'active' | 'paused' | 'terminated';
export type PaymentStatus = 'pending' | 'submitted' | 'confirmed' | 'rejected';
export type RevenueSource = 'pt' | 'program' | 'other';
export type ExpenseCategory = 'server' | 'ai_usage' | 'fixed' | 'tax' | 'marketing' | 'other';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
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
  share_ratio: number; // 5, 3, or 2
  created_at: string;
}

export interface PtUser {
  id: string;
  profile_id: string;
  share_percentage: number;
  status: PtStatus;
  program_access_active: boolean;
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
  admin_note: string | null;
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
    };
  };
}
