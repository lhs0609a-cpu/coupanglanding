-- 좀비 락 일괄 해제 — 미납 0원 + 재시도 없음 + admin_override 없음인 사용자
-- payment_clear_overdue_if_settled RPC 누락으로 발생한 누적 사고 정정.
--
-- 안전: 위 3가지 조건 모두 충족할 때만 해제. admin이 의도적으로 락 건 사용자(override)는 보존.
-- 실행 전 diagnostic_orphan_locks.sql 로 대상 먼저 확인 권장.

WITH unpaid_per_user AS (
  SELECT
    pt_user_id,
    SUM(total_with_vat) FILTER (WHERE fee_payment_status IN ('awaiting_payment','overdue','suspended')) AS unpaid_amount
  FROM monthly_reports
  GROUP BY pt_user_id
),
pending_retries AS (
  SELECT pt_user_id, COUNT(*) AS retry_count
  FROM payment_transactions
  WHERE status = 'failed'
    AND is_final_failure = false
    AND next_retry_at IS NOT NULL
  GROUP BY pt_user_id
),
zombies AS (
  SELECT pu.id
  FROM pt_users pu
  LEFT JOIN unpaid_per_user u ON u.pt_user_id = pu.id
  LEFT JOIN pending_retries r ON r.pt_user_id = pu.id
  WHERE pu.admin_override_level IS NULL
    AND COALESCE(u.unpaid_amount, 0) = 0
    AND COALESCE(r.retry_count, 0) = 0
    AND (pu.payment_overdue_since IS NOT NULL OR pu.payment_lock_level > 0)
)
UPDATE pt_users
SET
  payment_overdue_since = NULL,
  payment_lock_level = 0,
  payment_retry_in_progress = false,
  program_access_active = true
WHERE id IN (SELECT id FROM zombies)
RETURNING id, payment_overdue_since, payment_lock_level;
