-- 결제 락이 걸린 사용자별 "왜 풀리지 않는지" 가드 분석
--
-- payment_clear_overdue_if_settled RPC가 false 반환하는 두 가드:
--   가드 A: payment_transactions 중 status='failed' AND is_final_failure=false AND next_retry_at IS NOT NULL
--   가드 B: monthly_reports 중 fee_payment_status IN ('awaiting_payment','overdue','suspended')
--
-- 그 외:
--   admin_override_level 이 set 이면 자동 클리어 RPC가 안 건드림
--   payment_lock_exempt_until / billing_excluded_until 이 활성이면 layout 단에서 락 무시
--
-- 사용법: 화면에 모달 뜨는 사용자(예: 한정욱) 의 row 를 보면 어느 컬럼이 "범인" 인지 즉시 식별.

WITH unpaid_reports AS (
  SELECT
    pt_user_id,
    SUM(total_with_vat) FILTER (WHERE fee_payment_status IN ('awaiting_payment','overdue','suspended')) AS unpaid_amount,
    COUNT(*) FILTER (WHERE fee_payment_status IN ('awaiting_payment','overdue','suspended')) AS unpaid_count,
    STRING_AGG(
      year_month || ':' || fee_payment_status,
      ', ' ORDER BY year_month
    ) FILTER (WHERE fee_payment_status IN ('awaiting_payment','overdue','suspended')) AS unpaid_detail
  FROM monthly_reports
  GROUP BY pt_user_id
),
pending_retries AS (
  SELECT
    pt_user_id,
    COUNT(*) AS retry_count,
    STRING_AGG(
      'tx=' || id::text || ' next=' || COALESCE(next_retry_at::text,'?') || ' code=' || COALESCE(failure_code,'?'),
      ' | '
    ) AS retry_detail
  FROM payment_transactions
  WHERE status = 'failed'
    AND is_final_failure = false
    AND next_retry_at IS NOT NULL
  GROUP BY pt_user_id
),
zombie_paid_failed_tx AS (
  -- 리포트는 paid 인데 그 리포트의 failed tx가 next_retry_at 살아있음 (시나리오 1)
  SELECT
    pt.pt_user_id,
    COUNT(*) AS zombie_count,
    STRING_AGG(
      'rpt=' || mr.year_month || '(paid) tx=' || pt.id::text,
      ' | '
    ) AS zombie_detail
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
  pu.payment_lock_exempt_until,
  pu.billing_excluded_until,
  COALESCE(u.unpaid_amount, 0) AS unpaid_amount,
  COALESCE(u.unpaid_count, 0) AS unpaid_count,
  u.unpaid_detail,
  COALESCE(r.retry_count, 0) AS pending_retry_count,
  r.retry_detail,
  COALESCE(z.zombie_count, 0) AS zombie_paid_failed_count,
  z.zombie_detail,
  CASE
    WHEN pu.admin_override_level IS NOT NULL
      THEN 'C: ADMIN_OVERRIDE = ' || pu.admin_override_level::text || ' (수동 셋)'
    WHEN COALESCE(z.zombie_count, 0) > 0
      THEN 'A1: 좀비 failed tx — paid 리포트인데 next_retry_at 살아있음'
    WHEN COALESCE(r.retry_count, 0) > 0
      THEN 'A2: 미결 재시도 tx 존재 (next_retry_at 활성)'
    WHEN COALESCE(u.unpaid_count, 0) > 0
      THEN 'B: 미납 리포트 ' || u.unpaid_count::text || '건 — 한 달치만 결제하고 다른 월 미납'
    WHEN pu.payment_overdue_since IS NOT NULL OR pu.payment_lock_level > 0
      THEN 'D: 좀비 락 (RPC 호출 누락 — orphan lock hotfix 대상)'
    ELSE 'OK'
  END AS diagnosis
FROM pt_users pu
LEFT JOIN profiles p ON p.id = pu.profile_id
LEFT JOIN unpaid_reports u ON u.pt_user_id = pu.id
LEFT JOIN pending_retries r ON r.pt_user_id = pu.id
LEFT JOIN zombie_paid_failed_tx z ON z.pt_user_id = pu.id
WHERE pu.payment_overdue_since IS NOT NULL
   OR pu.payment_lock_level > 0
   OR pu.admin_override_level IS NOT NULL
ORDER BY pu.payment_lock_level DESC NULLS LAST,
         pu.payment_overdue_since ASC NULLS LAST;
