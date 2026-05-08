-- 결제됐는데 락 풀리지 않은 사용자 — 가장 답답한 사고 케이스
--
-- 정의:
--   - 미납 리포트(awaiting_payment/overdue/suspended)가 0건 = 다 결제됨
--   - 그런데 payment_lock_level > 0 또는 payment_overdue_since IS NOT NULL
--   - admin_override_level 이 set 됐을 수도 있음
--
-- 원인:
--   1) payment_clear_overdue_if_settled RPC 가 silent failure (이번에 에러 체크 추가됨)
--   2) 좀비 failed tx 의 next_retry_at 이 가드 A 차단 (이번에 finalize 자동화)
--   3) 관리자가 admin_override 셋한 후 안 풀어줌
--   4) RPC 아직 호출 안 된 상태 (예: 마지막 결제 후 cron 도 안 돌고 사용자도 액션 없음)

WITH paid_reports AS (
  SELECT
    pt_user_id,
    COUNT(*) FILTER (WHERE fee_payment_status = 'paid') AS paid_count,
    COUNT(*) FILTER (WHERE fee_payment_status IN ('awaiting_payment','overdue','suspended')) AS unpaid_count,
    MAX(payment_confirmed_at) FILTER (WHERE fee_payment_status = 'paid') AS last_paid_at
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
zombie_tx AS (
  SELECT pt.pt_user_id, COUNT(*) AS zombie_count
  FROM payment_transactions pt
  JOIN monthly_reports mr ON mr.id = pt.monthly_report_id
  WHERE pt.status = 'failed'
    AND pt.is_final_failure = false
    AND pt.next_retry_at IS NOT NULL
    AND mr.fee_payment_status = 'paid'
  GROUP BY pt.pt_user_id
)
SELECT
  pu.id AS pt_user_id,
  p.email,
  p.full_name,
  pu.payment_overdue_since,
  pu.payment_lock_level,
  pu.admin_override_level,
  pu.payment_retry_in_progress,
  COALESCE(pr.paid_count, 0) AS paid_count,
  COALESCE(pr.unpaid_count, 0) AS unpaid_count,
  pr.last_paid_at,
  COALESCE(pe.retry_count, 0) AS pending_retry_count,
  COALESCE(z.zombie_count, 0) AS zombie_paid_failed_count,
  CASE
    WHEN pu.admin_override_level IS NOT NULL
      THEN '관리자 override 잔존 — 수동 해제 필요'
    WHEN COALESCE(z.zombie_count, 0) > 0
      THEN '좀비 failed tx 가드 — hotfix_finalize_zombie_failed_tx.sql 실행 필요'
    WHEN COALESCE(pe.retry_count, 0) > 0
      THEN '미결 재시도 tx 가드 — 다른 미결 리포트 있는지 확인'
    WHEN COALESCE(pr.unpaid_count, 0) = 0
      THEN '클리어 RPC 미호출 — payment_clear_overdue_if_settled 직접 호출 권장'
    ELSE '미납 잔존 (정상 락)'
  END AS root_cause
FROM pt_users pu
LEFT JOIN profiles p ON p.id = pu.profile_id
LEFT JOIN paid_reports pr ON pr.pt_user_id = pu.id
LEFT JOIN pending_retries pe ON pe.pt_user_id = pu.id
LEFT JOIN zombie_tx z ON z.pt_user_id = pu.id
WHERE
  -- 락 걸려있는 사용자만
  (pu.payment_lock_level > 0 OR pu.payment_overdue_since IS NOT NULL OR pu.admin_override_level > 0)
  -- 그런데 paid 리포트가 1건 이상 있음 = 결제는 됐다는 신호
  AND COALESCE(pr.paid_count, 0) > 0
ORDER BY pu.payment_lock_level DESC NULLS LAST,
         pr.last_paid_at DESC NULLS LAST;
