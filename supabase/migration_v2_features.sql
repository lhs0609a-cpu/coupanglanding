-- ============================================
-- V2 기능 확장 마이그레이션
-- 알림, 활동로그, 반복비용, 영수증, 암호화 등
-- Supabase SQL Editor에서 실행
-- ============================================

-- ═══════════════════════════════════════════
-- 1. 알림 (notifications) 테이블
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

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════
-- 2. 관리자 활동 로그 (admin_activity_logs) 테이블
-- ═══════════════════════════════════════════
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

CREATE POLICY "Admin can view all logs" ON public.admin_activity_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can insert logs" ON public.admin_activity_logs
  FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════
-- 3. 반복 비용 템플릿 (recurring_expenses) 테이블
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount BIGINT NOT NULL,
  paid_by_partner_id UUID REFERENCES public.partners(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/partner can manage recurring expenses" ON public.recurring_expenses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'partner'))
  );

-- ═══════════════════════════════════════════
-- 4. 수익/비용 영수증 첨부 컬럼 추가
-- ═══════════════════════════════════════════
ALTER TABLE public.revenue_entries ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.expense_entries ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- ═══════════════════════════════════════════
-- 5. 분배 확정 취소용 컬럼
-- ═══════════════════════════════════════════
ALTER TABLE public.distribution_snapshots ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.distribution_snapshots ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.distribution_snapshots ADD COLUMN IF NOT EXISTS cancelled_by UUID;

-- ═══════════════════════════════════════════
-- 6. 영수증 스토리지 버킷
-- ═══════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin can upload receipts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view receipts" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts');

-- ═══════════════════════════════════════════
-- 7. monthly_reports에 반려 사유 필수 관련 (admin_note 이미 있음, reject_reason 추가)
-- ═══════════════════════════════════════════
ALTER TABLE public.monthly_reports ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- ═══════════════════════════════════════════
-- 8. 파트너 테이블에 상태 추가
-- ═══════════════════════════════════════════
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
