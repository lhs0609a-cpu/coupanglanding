-- 미납 0원인데 락이 걸린 좀비 사용자 진단
-- payment_clear_overdue_if_settled RPC가 누락되어 발생한 사고 확인용.

-- ─── 섹션 1: 좀비 락 사용자 (미납 없음 + 락 활성) ─────────────────────
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
)
SELECT
  pu.id AS pt_user_id,
  p.email,
  pu.payment_overdue_since,
  pu.payment_lock_level,
  pu.payment_retry_in_progress,
  pu.admin_override_level,
  COALESCE(u.unpaid_amount, 0) AS unpaid_amount,
  COALESCE(r.retry_count, 0) AS pending_retry_count,
  CASE
    WHEN pu.admin_override_level IS NOT NULL THEN 'ADMIN_OVERRIDE (정상)'
    WHEN COALESCE(u.unpaid_amount, 0) = 0 AND COALESCE(r.retry_count, 0) = 0 AND pu.payment_overdue_since IS NOT NULL
      THEN '⚠ 좀비 락 — 미납 없는데 overdue_since 남아있음'
    WHEN COALESCE(u.unpaid_amount, 0) = 0 AND pu.payment_lock_level > 0
      THEN '⚠ 좀비 락 — 미납 없는데 lock_level > 0'
    ELSE 'OK'
  END AS diagnosis
FROM pt_users pu
LEFT JOIN profiles p ON p.id = pu.profile_id
LEFT JOIN unpaid_per_user u ON u.pt_user_id = pu.id
LEFT JOIN pending_retries r ON r.pt_user_id = pu.id
WHERE pu.payment_overdue_since IS NOT NULL
   OR pu.payment_lock_level > 0
ORDER BY pu.payment_lock_level DESC, pu.payment_overdue_since;
