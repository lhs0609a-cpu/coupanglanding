-- ============================================
-- 온보딩 체크리스트 스키마
-- Supabase SQL Editor에서 실행
-- ============================================

-- onboarding_steps 테이블
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

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- PT 사용자: 자기 행만 조회
CREATE POLICY "PT users can view own onboarding steps" ON public.onboarding_steps
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

-- PT 사용자: 자기 행만 INSERT
CREATE POLICY "PT users can insert own onboarding steps" ON public.onboarding_steps
  FOR INSERT WITH CHECK (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

-- PT 사용자: 자기 행만 UPDATE
CREATE POLICY "PT users can update own onboarding steps" ON public.onboarding_steps
  FOR UPDATE USING (
    pt_user_id IN (SELECT id FROM public.pt_users WHERE profile_id = auth.uid())
  );

-- 관리자: 전체 접근
CREATE POLICY "Admin can manage all onboarding steps" ON public.onboarding_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- ============================================
-- Storage: 온보딩 증빙 버킷
-- ============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-evidence', 'onboarding-evidence', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload onboarding evidence" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'onboarding-evidence' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view onboarding evidence" ON storage.objects
  FOR SELECT USING (bucket_id = 'onboarding-evidence');

CREATE POLICY "Authenticated users can update onboarding evidence" ON storage.objects
  FOR UPDATE USING (bucket_id = 'onboarding-evidence' AND auth.role() = 'authenticated');

-- ============================================
-- 인덱스
-- ============================================

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_pt_user ON public.onboarding_steps(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_status ON public.onboarding_steps(status);
