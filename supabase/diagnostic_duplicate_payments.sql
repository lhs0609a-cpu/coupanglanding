-- 중복 결제 검출 — 같은 monthly_report 에 status='success' 인 tx 가 2건 이상
--
-- 사고 모델:
--   1) 자동결제 실패 → 사용자 카드 재등록 + 즉시 결제 → 새 tx success
--   2) 동시에 자동결제 cron 이 또 시도 → 또 success
--   3) 또는: 사용자가 수동결제 누른 직후 cron 도 같은 시점에 결제
--   결과: 동일 리포트에 토스 결제 2건 → 실제 카드 2번 청구됨
--
-- 운영자 행동:
--   가장 늦은 success tx 를 보존하고 나머지를 토스 cancel 처리.
--   payment_transactions.toss_payment_key 가 토스에 cancel API 보낼 때 필요.

WITH dup_reports AS (
  SELECT
    monthly_report_id,
    COUNT(*) AS success_count,
    SUM(total_amount) AS total_charged,
    MIN(created_at) AS first_charged_at,
    MAX(created_at) AS last_charged_at
  FROM payment_transactions
  WHERE status = 'success'
  GROUP BY monthly_report_id
  HAVING COUNT(*) >= 2
)
SELECT
  d.monthly_report_id,
  mr.year_month,
  mr.fee_payment_status,
  d.success_count,
  d.total_charged,
  d.first_charged_at,
  d.last_charged_at,
  pu.id AS pt_user_id,
  p.full_name,
  p.email,
  -- 중복 tx 상세 (시간순)
  (
    SELECT json_agg(json_build_object(
      'tx_id', pt.id,
      'toss_payment_key', pt.toss_payment_key,
      'toss_order_id', pt.toss_order_id,
      'amount', pt.total_amount,
      'is_auto', pt.is_auto_payment,
      'created_at', pt.created_at,
      'approved_at', pt.approved_at,
      'receipt_url', pt.receipt_url
    ) ORDER BY pt.created_at)
    FROM payment_transactions pt
    WHERE pt.monthly_report_id = d.monthly_report_id
      AND pt.status = 'success'
  ) AS duplicate_txs
FROM dup_reports d
JOIN monthly_reports mr ON mr.id = d.monthly_report_id
JOIN pt_users pu ON pu.id = mr.pt_user_id
LEFT JOIN profiles p ON p.id = pu.profile_id
ORDER BY d.last_charged_at DESC;
