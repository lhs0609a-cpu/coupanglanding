-- 결제 취소 추적 컬럼 추가
-- 관리자가 결제를 토스로 cancel 했을 때, 누가/언제/왜 취소했는지 흔적 보존.
--
-- 안전: ADD COLUMN IF NOT EXISTS — 멱등 적용 가능.
-- 사용처: /api/admin/payments/transactions/[txId]/cancel

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_cancelled_at
  ON payment_transactions(cancelled_at)
  WHERE cancelled_at IS NOT NULL;
