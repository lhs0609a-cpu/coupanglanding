-- ============================================
-- 전체 통합 마이그레이션 (순서대로 실행)
-- Supabase SQL Editor에서 한번에 실행
-- 이미 존재하는 테이블/컬럼은 IF NOT EXISTS로 스킵됨
-- ============================================

-- ═══════════════════════════════════════════
-- PHASE 1: 기본 함수
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════
-- PHASE 2: 코어 테이블 (migration.sql)
-- ═══════════════════════════════════════════

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'pt_user' CHECK (role IN ('admin', 'partner', 'pt_user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'pt_user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. partners
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  share_ratio INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. pt_users
CREATE TABLE IF NOT EXISTS public.pt_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_percentage NUMERIC NOT NULL DEFAULT 30.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
  program_access_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pt_users_updated_at ON public.pt_users;
CREATE TRIGGER pt_users_updated_at
  BEFORE UPDATE ON public.pt_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. monthly_reports
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES public.pt_users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  reported_revenue BIGINT NOT NULL DEFAULT 0,
  screenshot_url TEXT,
  calculated_deposit BIGINT NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'submitted', 'confirmed', 'rejected')),
  payment_confirmed_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, year_month)
);

DROP TRIGGER IF EXISTS monthly_reports_updated_at ON public.monthly_reports;
CREATE TRIGGER monthly_reports_updated_at
  BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. revenue_entries
CREATE TABLE IF NOT EXISTS public.revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pt', 'program', 'other')),
  description TEXT NOT NULL DEFAULT '',
  amount BIGINT NOT NULL DEFAULT 0,
  main_partner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. expense_entries
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('server', 'ai_usage', 'fixed', 'tax', 'marketing', 'other')),
  description TEXT NOT NULL DEFAULT '',
  amount BIGINT NOT NULL DEFAULT 0,
  paid_by_partner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. distribution_snapshots
CREATE TABLE IF NOT EXISTS public.distribution_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT UNIQUE NOT NULL,
  total_revenue BIGINT NOT NULL DEFAULT 0,
  total_expenses BIGINT NOT NULL DEFAULT 0,
  net_profit BIGINT NOT NULL DEFAULT 0,
  distribution_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. applications
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  category_interest TEXT,
  current_situation TEXT,
  coupang_experience TEXT,
  message TEXT,
  source TEXT DEFAULT 'pt',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'consulting', 'converted', 'rejected')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS applications_updated_at ON public.applications;
CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 9. contracts
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES public.pt_users(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL DEFAULT 'standard',
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date DATE NOT NULL,
  end_date DATE,
  share_percentage NUMERIC NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'expired', 'terminated')),
  signed_at TIMESTAMPTZ,
  signed_ip TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, start_date)
);

DROP TRIGGER IF EXISTS contracts_updated_at ON public.contracts;
CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════
-- PHASE 3: RLS (코어)
-- ═══════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- profiles RLS
DO $$ BEGIN
  CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update profiles" ON public.profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- partners RLS
DO $$ BEGIN
  CREATE POLICY "Admin/partner can view partners" ON public.partners FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage partners" ON public.partners FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pt_users RLS
DO $$ BEGIN
  CREATE POLICY "PT users can view own data" ON public.pt_users FOR SELECT USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage pt_users" ON public.pt_users FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- monthly_reports RLS
DO $$ BEGIN
  CREATE POLICY "PT users can manage own reports" ON public.monthly_reports FOR ALL USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage all reports" ON public.monthly_reports FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- revenue/expense/distribution RLS
DO $$ BEGIN
  CREATE POLICY "Admin can manage revenue" ON public.revenue_entries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage expenses" ON public.expense_entries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage distributions" ON public.distribution_snapshots FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- applications RLS
DO $$ BEGIN
  CREATE POLICY "Anyone can insert applications" ON public.applications FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can view applications" ON public.applications FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can update applications" ON public.applications FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- contracts RLS
DO $$ BEGIN
  CREATE POLICY "PT users can view own contracts" ON public.contracts FOR SELECT USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "PT users can sign own contracts" ON public.contracts FOR UPDATE USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage contracts" ON public.contracts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- PHASE 4: Storage 버킷
-- ═══════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES ('revenue-screenshots', 'revenue-screenshots', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload screenshots" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'revenue-screenshots' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public can view screenshots" ON storage.objects
    FOR SELECT USING (bucket_id = 'revenue-screenshots');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can update screenshots" ON storage.objects
    FOR UPDATE USING (bucket_id = 'revenue-screenshots' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- PHASE 5: 코어 인덱스
-- ═══════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_monthly_reports_year_month ON public.monthly_reports(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_pt_user ON public.monthly_reports(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_year_month ON public.revenue_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_expense_entries_year_month ON public.expense_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_pt_users_profile ON public.pt_users(profile_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created ON public.applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_pt_user ON public.contracts(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

-- ═══════════════════════════════════════════
-- PHASE 6: V2 기능 (notifications, activity_logs, recurring_expenses 등)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin ON public.admin_activity_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_target ON public.admin_activity_logs(target_type, target_id);
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin can view all logs" ON public.admin_activity_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role can insert logs" ON public.admin_activity_logs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount BIGINT NOT NULL,
  paid_by_partner_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admin/partner can manage recurring expenses" ON public.recurring_expenses FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- V2 컬럼 추가
ALTER TABLE public.revenue_entries ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.expense_entries ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.distribution_snapshots ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.distribution_snapshots ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.distribution_snapshots ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 영수증 버킷
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Admin can upload receipts" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public can view receipts" ON storage.objects
    FOR SELECT USING (bucket_id = 'receipts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- PHASE 7: phone 컬럼 + 트리거 업데이트
-- ═══════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_name_phone ON public.profiles(full_name, phone);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pt_user'),
    true,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════
-- PHASE 8: 서명, 자격증명, API 컬럼
-- ═══════════════════════════════════════════

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signature_data TEXT;

ALTER TABLE public.pt_users ADD COLUMN IF NOT EXISTS coupang_seller_id TEXT DEFAULT NULL;
ALTER TABLE public.pt_users ADD COLUMN IF NOT EXISTS coupang_seller_pw TEXT DEFAULT NULL;

DO $$ BEGIN
  CREATE POLICY "Users can view own coupang credentials" ON pt_users FOR SELECT USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own coupang credentials" ON pt_users FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_vendor_id TEXT;
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_access_key TEXT;
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_secret_key TEXT;
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_api_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_api_key_expires_at TIMESTAMPTZ;

ALTER TABLE monthly_reports ADD COLUMN IF NOT EXISTS api_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE monthly_reports ADD COLUMN IF NOT EXISTS api_settlement_data JSONB;

CREATE INDEX IF NOT EXISTS idx_monthly_reports_api_verified ON monthly_reports (api_verified) WHERE api_verified = TRUE;

-- ═══════════════════════════════════════════
-- PHASE 9: 가이드 이미지
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.guide_step_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_step_images_article ON public.guide_step_images (article_id, step_index, display_order);
ALTER TABLE public.guide_step_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "guide_step_images_select" ON public.guide_step_images FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "guide_step_images_insert" ON public.guide_step_images FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "guide_step_images_delete" ON public.guide_step_images FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.hidden_guide_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  image_index INTEGER NOT NULL,
  hidden_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(article_id, step_index, image_index)
);

CREATE INDEX IF NOT EXISTS idx_hidden_guide_images_article ON public.hidden_guide_images (article_id);
ALTER TABLE public.hidden_guide_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "hidden_guide_images_select" ON public.hidden_guide_images FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "hidden_guide_images_insert" ON public.hidden_guide_images FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "hidden_guide_images_delete" ON public.hidden_guide_images FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- PHASE 10: 트레이너 시스템
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trainers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL UNIQUE REFERENCES pt_users(id) ON DELETE CASCADE,
  referral_code VARCHAR(20) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  bonus_percentage NUMERIC(5,2) NOT NULL DEFAULT 5,
  approved_at TIMESTAMPTZ,
  total_earnings NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_trainees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  trainee_pt_user_id UUID NOT NULL UNIQUE REFERENCES pt_users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainer_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  trainee_pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  monthly_report_id UUID NOT NULL UNIQUE REFERENCES monthly_reports(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  trainee_net_profit NUMERIC(12,0) NOT NULL DEFAULT 0,
  bonus_percentage NUMERIC(5,2) NOT NULL DEFAULT 5,
  bonus_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'confirmed', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);

ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_trainees ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_earnings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "trainers_select_own" ON trainers FOR SELECT USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "trainers_admin_all" ON trainers FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "trainer_trainees_select_own" ON trainer_trainees FOR SELECT USING (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "trainer_trainees_admin_all" ON trainer_trainees FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "trainer_earnings_select_own" ON trainer_earnings FOR SELECT USING (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "trainer_earnings_admin_all" ON trainer_earnings FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_trainers_status ON trainers(status);
CREATE INDEX IF NOT EXISTS idx_trainers_referral_code ON trainers(referral_code);
CREATE INDEX IF NOT EXISTS idx_trainer_trainees_trainer_id ON trainer_trainees(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_earnings_trainer_id ON trainer_earnings(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_earnings_year_month ON trainer_earnings(year_month);
CREATE INDEX IF NOT EXISTS idx_applications_referral_code ON applications(referral_code);

-- ═══════════════════════════════════════════
-- PHASE 11: 계약 해지
-- ═══════════════════════════════════════════

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS termination_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_deactivation_deadline TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_deactivation_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_deactivation_evidence_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS termination_acknowledged_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════
-- PHASE 12: 긴급 대응 (블랙리스트 + 인시던트)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS brand_blacklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name TEXT NOT NULL,
  brand_name_en TEXT,
  category TEXT,
  risk_level TEXT NOT NULL DEFAULT 'warning' CHECK (risk_level IN ('low','warning','high','critical')),
  complaint_type TEXT NOT NULL CHECK (complaint_type IN ('trademark','copyright','authentic_cert','parallel_import','price_policy','other')),
  description TEXT,
  reported_count INTEGER DEFAULT 1,
  added_by UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id),
  incident_type TEXT NOT NULL CHECK (incident_type IN ('brand_complaint','account_penalty')),
  sub_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','in_progress','resolved','escalated','closed')),
  title TEXT NOT NULL,
  description TEXT,
  brand_name TEXT,
  product_name TEXT,
  coupang_reference TEXT,
  actions_taken TEXT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  admin_note TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE brand_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "brand_blacklist_select" ON brand_blacklist FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "brand_blacklist_admin_insert" ON brand_blacklist FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "brand_blacklist_admin_update" ON brand_blacklist FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "brand_blacklist_admin_delete" ON brand_blacklist FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "incidents_select_own" ON incidents FOR SELECT TO authenticated USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "incidents_insert_own" ON incidents FOR INSERT TO authenticated WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "incidents_update" ON incidents FOR UPDATE TO authenticated USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_brand_blacklist_brand ON brand_blacklist(brand_name);
CREATE INDEX IF NOT EXISTS idx_brand_blacklist_active ON brand_blacklist(is_active);
CREATE INDEX IF NOT EXISTS idx_incidents_pt_user ON incidents(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(incident_type);

-- ═══════════════════════════════════════════
-- PHASE 13: 트렌드 키워드
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trending_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '기타',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'naver')),
  trend_score INTEGER NOT NULL DEFAULT 50 CHECK (trend_score BETWEEN 0 AND 100),
  naver_category_id TEXT,
  naver_trend_data JSONB,
  naver_fetched_at TIMESTAMPTZ,
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trending_keywords_active ON trending_keywords (is_active, trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_keywords_category ON trending_keywords (category) WHERE is_active = true;
ALTER TABLE trending_keywords ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "trending_keywords_select" ON trending_keywords FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "trending_keywords_admin_insert" ON trending_keywords FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "trending_keywords_admin_update" ON trending_keywords FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "trending_keywords_admin_delete" ON trending_keywords FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- PHASE 14: 탈퇴 기능
-- ═══════════════════════════════════════════

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_evidence_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_status TEXT CHECK (withdrawal_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_rejected_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_approved_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_reviewed_by UUID REFERENCES profiles(id);

-- ═══════════════════════════════════════════
-- PHASE 15: 온보딩
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES public.pt_users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
  evidence_url TEXT,
  admin_note TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, step_key)
);

DROP TRIGGER IF EXISTS onboarding_steps_updated_at ON public.onboarding_steps;
CREATE TRIGGER onboarding_steps_updated_at
  BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "PT users can view own onboarding steps" ON public.onboarding_steps FOR SELECT USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "PT users can insert own onboarding steps" ON public.onboarding_steps FOR INSERT WITH CHECK (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "PT users can update own onboarding steps" ON public.onboarding_steps FOR UPDATE USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admin can manage all onboarding steps" ON public.onboarding_steps FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_pt_user ON public.onboarding_steps(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_status ON public.onboarding_steps(status);

INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-evidence', 'onboarding-evidence', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload onboarding evidence" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'onboarding-evidence' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public can view onboarding evidence" ON storage.objects
    FOR SELECT USING (bucket_id = 'onboarding-evidence');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can update onboarding evidence" ON storage.objects
    FOR UPDATE USING (bucket_id = 'onboarding-evidence' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════
-- PHASE 16: monthly_reports 보정 (migration_fix.sql)
-- ═══════════════════════════════════════════

ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_product BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_commission BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_advertising BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_returns BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_shipping BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_tax BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS ad_screenshot_url TEXT;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS admin_deposit_amount BIGINT;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMPTZ;

ALTER TABLE public.monthly_reports DROP CONSTRAINT IF EXISTS monthly_reports_payment_status_check;
ALTER TABLE public.monthly_reports ADD CONSTRAINT monthly_reports_payment_status_check
  CHECK (payment_status IN ('pending', 'submitted', 'reviewed', 'deposited', 'confirmed', 'rejected'));

-- ═══════════════════════════════════════════
-- 완료
-- ═══════════════════════════════════════════
