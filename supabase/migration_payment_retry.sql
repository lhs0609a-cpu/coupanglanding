-- 결제 실패 자동 재시도 시스템
-- 정책:
--   * Retryable 실패 → 24h 후 자동 재시도 (최대 3회)
--   * 재시도 진행 중에는 락 유예 (D+3까지)
--   * 3회 모두 실패 또는 Non-retryable 즉시 실패 → is_final_failure=true → 연체 마킹

-- ─────────────────────────────────────────────
-- 1) payment_transactions 확장
-- ─────────────────────────────────────────────
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_final_failure BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_failed_at TIMESTAMPTZ;

-- 재시도 대상 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_payment_tx_retry_pending
  ON payment_transactions(next_retry_at)
  WHERE status = 'failed' AND is_final_failure = false AND next_retry_at IS NOT NULL;

-- 부모-자식 체인 추적용 인덱스
CREATE INDEX IF NOT EXISTS idx_payment_tx_parent
  ON payment_transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 2) pt_users: 재시도 진행 중 플래그 (락 유예 판단용)
-- ─────────────────────────────────────────────
ALTER TABLE pt_users
  ADD COLUMN IF NOT EXISTS payment_retry_in_progress BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pt_users_retry_in_progress
  ON pt_users(payment_retry_in_progress)
  WHERE payment_retry_in_progress = true;
