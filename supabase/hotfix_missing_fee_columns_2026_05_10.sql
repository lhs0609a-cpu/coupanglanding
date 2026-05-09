-- ============================================================
-- HOTFIX (2026-05-10): payment_mark_success RPC 가 monthly_reports.fee_confirmed_at
-- 컬럼 참조하는데 production DB 에 컬럼 없어서 RPC 가 silently 실패.
-- → 모든 자동 복구 도구 (Pass A, Pass B, force-recover-all, toss-settlement-reconcile)
--   가 5건 RPC 에러로 실패하고 있던 진짜 원인.
--
-- 사고 케이스: 한정욱/박영호/나인호/이지영 — 토스에선 정산 완료, 시스템엔 최종실패.
--
-- 동작:
--   1) 누락된 fee_payment_* 컬럼 모두 안전하게 추가 (IF NOT EXISTS)
--   2) 과거 paid 리포트에 fee_confirmed_at 백필 (NULL 이면 fee_paid_at 으로)
--   3) settlement_completed_at 도 누락 가능성 있어 함께 추가
--
-- 안전: 모든 ADD COLUMN 은 IF NOT EXISTS, UPDATE 는 NULL 만 백필.
-- 운영 영향: 없음 (스키마 추가 + NULL 백필).
-- ============================================================

-- ── monthly_reports 누락 컬럼 안전 추가 ──
ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS fee_payment_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS fee_payment_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_surcharge_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_interest_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- ── 과거 paid 리포트에 fee_confirmed_at 백필 ──
-- fee_paid_at 은 있는데 fee_confirmed_at NULL 인 경우만 (안전 가드)
UPDATE public.monthly_reports
SET fee_confirmed_at = fee_paid_at
WHERE fee_payment_status = 'paid'
  AND fee_confirmed_at IS NULL
  AND fee_paid_at IS NOT NULL;

-- ── 인덱스 보강 (이미 있으면 skip) ──
CREATE INDEX IF NOT EXISTS idx_monthly_reports_fee_payment_status
  ON public.monthly_reports (fee_payment_status)
  WHERE fee_payment_status NOT IN ('not_applicable', 'paid');

-- ── 검증 쿼리 (실행 후 콘솔에서 확인) ──
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='monthly_reports'
-- ORDER BY column_name;
--
-- 결과에 fee_confirmed_at 가 보여야 함.
