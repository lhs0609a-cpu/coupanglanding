-- ============================================
-- 누락된 컬럼/테이블 보정 마이그레이션
-- Supabase SQL Editor에서 한번에 실행하세요
-- ============================================

-- ═══════════════════════════════════════════
-- 1. onboarding_steps 테이블 생성 (404 에러 해결)
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

CREATE TRIGGER onboarding_steps_updated_at
  BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PT users can view own onboarding steps" ON public.onboarding_steps
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "PT users can insert own onboarding steps" ON public.onboarding_steps
  FOR INSERT WITH CHECK (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "PT users can update own onboarding steps" ON public.onboarding_steps
  FOR UPDATE USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "Admin can manage all onboarding steps" ON public.onboarding_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_pt_user ON public.onboarding_steps(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_status ON public.onboarding_steps(status);

-- Storage: 온보딩 증빙 버킷
INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-evidence', 'onboarding-evidence', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload onboarding evidence" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'onboarding-evidence' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view onboarding evidence" ON storage.objects
  FOR SELECT USING (bucket_id = 'onboarding-evidence');

CREATE POLICY "Authenticated users can update onboarding evidence" ON storage.objects
  FOR UPDATE USING (bucket_id = 'onboarding-evidence' AND auth.role() = 'authenticated');


-- ═══════════════════════════════════════════
-- 2. monthly_reports 누락 컬럼 추가 (406 에러 해결)
-- ═══════════════════════════════════════════

-- 비용 항목 컬럼
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_product BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_commission BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_advertising BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_returns BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_shipping BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS cost_tax BIGINT NOT NULL DEFAULT 0;

-- 광고비 스크린샷
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS ad_screenshot_url TEXT;

-- 관리자 입금/검토 관련
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS admin_deposit_amount BIGINT;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMPTZ;

-- payment_status CHECK 제약조건 업데이트 (reviewed, deposited 추가)
ALTER TABLE public.monthly_reports DROP CONSTRAINT IF EXISTS monthly_reports_payment_status_check;
ALTER TABLE public.monthly_reports ADD CONSTRAINT monthly_reports_payment_status_check
  CHECK (payment_status IN ('pending', 'submitted', 'reviewed', 'deposited', 'confirmed', 'rejected'));
