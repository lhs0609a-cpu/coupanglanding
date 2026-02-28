-- ============================================
-- 쿠팡 셀러허브 관리 시스템 DB 스키마
-- Supabase SQL Editor에서 실행
-- ============================================

-- 1. profiles 테이블 (auth.users 연동)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'pt_user' CHECK (role IN ('admin', 'partner', 'pt_user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- auth.users 생성 시 자동 프로필 생성 트리거
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

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. partners 테이블
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  share_ratio INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. pt_users 테이블
CREATE TABLE IF NOT EXISTS public.pt_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_percentage NUMERIC NOT NULL DEFAULT 30.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
  program_access_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER pt_users_updated_at
  BEFORE UPDATE ON public.pt_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. monthly_reports 테이블
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES public.pt_users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  reported_revenue BIGINT NOT NULL DEFAULT 0,
  screenshot_url TEXT,
  calculated_deposit BIGINT NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'submitted', 'confirmed', 'rejected')),
  payment_confirmed_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, year_month)
);

CREATE TRIGGER monthly_reports_updated_at
  BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. revenue_entries 테이블
CREATE TABLE IF NOT EXISTS public.revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pt', 'program', 'other')),
  description TEXT NOT NULL DEFAULT '',
  amount BIGINT NOT NULL DEFAULT 0,
  main_partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. expense_entries 테이블
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('server', 'ai_usage', 'fixed', 'tax', 'marketing', 'other')),
  description TEXT NOT NULL DEFAULT '',
  amount BIGINT NOT NULL DEFAULT 0,
  paid_by_partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. distribution_snapshots 테이블
CREATE TABLE IF NOT EXISTS public.distribution_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT UNIQUE NOT NULL,
  total_revenue BIGINT NOT NULL DEFAULT 0,
  total_expenses BIGINT NOT NULL DEFAULT 0,
  net_profit BIGINT NOT NULL DEFAULT 0,
  distribution_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_snapshots ENABLE ROW LEVEL SECURITY;

-- profiles: 자기 프로필 읽기 가능, admin은 모두 읽기/수정 가능
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- partners: admin/partner만 읽기, admin만 수정
CREATE POLICY "Admin/partner can view partners" ON public.partners
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

CREATE POLICY "Admin can manage partners" ON public.partners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- pt_users: 자기 정보 읽기, admin 전체 관리
CREATE POLICY "PT users can view own data" ON public.pt_users
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Admin can manage pt_users" ON public.pt_users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- monthly_reports: PT 사용자는 자기 보고만, admin은 전체
CREATE POLICY "PT users can manage own reports" ON public.monthly_reports
  FOR ALL USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "Admin can manage all reports" ON public.monthly_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- revenue_entries: admin/partner만
CREATE POLICY "Admin can manage revenue" ON public.revenue_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- expense_entries: admin/partner만
CREATE POLICY "Admin can manage expenses" ON public.expense_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- distribution_snapshots: admin/partner만
CREATE POLICY "Admin can manage distributions" ON public.distribution_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- ============================================
-- Storage: 매출 스크린샷 버킷
-- ============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('revenue-screenshots', 'revenue-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- 스크린샷 업로드: 인증된 사용자만
CREATE POLICY "Authenticated users can upload screenshots" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'revenue-screenshots' AND auth.role() = 'authenticated');

-- 스크린샷 읽기: 공개
CREATE POLICY "Public can view screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'revenue-screenshots');

-- 스크린샷 덮어쓰기: 인증된 사용자만
CREATE POLICY "Authenticated users can update screenshots" ON storage.objects
  FOR UPDATE USING (bucket_id = 'revenue-screenshots' AND auth.role() = 'authenticated');

-- ============================================
-- 인덱스
-- ============================================

CREATE INDEX IF NOT EXISTS idx_monthly_reports_year_month ON public.monthly_reports(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_pt_user ON public.monthly_reports(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_year_month ON public.revenue_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_expense_entries_year_month ON public.expense_entries(year_month);
CREATE INDEX IF NOT EXISTS idx_pt_users_profile ON public.pt_users(profile_id);
