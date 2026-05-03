-- ============================================================
-- 중복 결제 절대 차단 — DB 레벨 최후 방어선
-- ------------------------------------------------------------
-- 기존 방어:
--   1) fee_payment_status='paid' 리포트는 query 대상 제외
--   2) UNIQUE INDEX uq_payment_tx_pending_per_report — 동시 pending 1개만
--   3) payment_transactions.toss_order_id UNIQUE — 동일 orderId 두 번 불가
--   4) payment_mark_success RPC 의 idempotency guard
--   5) cron_locks 행 기반 TTL 락 (auto-billing 과 admin 트리거 공유)
--
-- 추가 방어 (이 마이그레이션):
--   6) UNIQUE INDEX uq_payment_tx_success_per_report — 동일 리포트에
--      status='success' 인 tx 최대 1개. 이미 결제된 리포트에 새 success tx
--      만들려는 시도는 DB 레벨에서 거부됨 (RPC / route 우회해도).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tx_success_per_report
  ON payment_transactions (monthly_report_id)
  WHERE status = 'success' AND monthly_report_id IS NOT NULL;

-- 보조 인덱스: 결제 직전 fresh check 가속
CREATE INDEX IF NOT EXISTS idx_payment_tx_report_status
  ON payment_transactions (monthly_report_id, status);


-- ============================================================
-- safe_check_report_for_billing — 결제 직전 fresh status 확인 RPC
-- ------------------------------------------------------------
-- 리포트의 fee_payment_status 와 success tx 존재 여부를 동시에 확인.
-- query 후 결제 시도 사이의 race window 를 제거.
-- ============================================================
CREATE OR REPLACE FUNCTION safe_check_report_for_billing(
  p_report_id UUID
) RETURNS TABLE (
  is_billable BOOLEAN,
  current_status TEXT,
  has_success_tx BOOLEAN,
  reason TEXT
) AS $func$
DECLARE
  v_status TEXT;
  v_has_success BOOLEAN;
BEGIN
  SELECT fee_payment_status INTO v_status
    FROM monthly_reports
   WHERE id = p_report_id;

  IF v_status IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, false, 'report not found';
    RETURN;
  END IF;

  IF v_status = 'paid' THEN
    RETURN QUERY SELECT false, v_status, true, 'already paid';
    RETURN;
  END IF;

  IF v_status NOT IN ('awaiting_payment', 'overdue', 'suspended') THEN
    RETURN QUERY SELECT false, v_status, false, 'not in billable status';
    RETURN;
  END IF;

  -- 추가 안전: 이미 success tx 가 있다면 (status 동기화 안된 경우) 차단
  SELECT EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE monthly_report_id = p_report_id AND status = 'success'
  ) INTO v_has_success;

  IF v_has_success THEN
    RETURN QUERY SELECT false, v_status, true, 'success tx already exists (status mismatch)';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_status, false, 'OK';
END;
$func$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION safe_check_report_for_billing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION safe_check_report_for_billing(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
