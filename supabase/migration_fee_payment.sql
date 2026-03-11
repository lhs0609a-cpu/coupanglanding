-- 수수료 납부 추적 필드 추가
-- fee_payment_status: not_applicable → awaiting_payment → paid / overdue → suspended
ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS fee_payment_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS fee_payment_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_surcharge_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_interest_amount INTEGER NOT NULL DEFAULT 0;

-- 인덱스: 연체 리포트 조회 최적화
CREATE INDEX IF NOT EXISTS idx_monthly_reports_fee_payment_status
  ON public.monthly_reports (fee_payment_status)
  WHERE fee_payment_status NOT IN ('not_applicable', 'paid');
