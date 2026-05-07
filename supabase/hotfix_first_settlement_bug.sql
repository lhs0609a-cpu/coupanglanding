-- 첫 정산 구간(isInitial) 누락 사고 일괄 정정
-- 패턴: period_start=NULL + api_verified=true 인 첫 정산 보고서
-- 영향: 3월 후반(가입일~3/31) 매출 누락 → 사용자에게 적게 청구한 게 아니라
--       실제로 어떤 청구가 맞는지 다시 산출 필요

-- 안전성:
-- 1. fee_payment_status='paid' 인 행은 회계 무결성을 위해 건드리지 않음
-- 2. 보고서를 'submitted' 로 되돌려 사용자가 재제출 가능하게만 함
-- 3. 매출/비용 데이터는 보존 — 사용자가 API 다시 호출하면 덮어써짐

WITH affected AS (
  SELECT
    mr.id AS report_id,
    pu.id AS pt_user_id,
    p.email,
    pu.created_at AS join_date,
    mr.reported_revenue,
    mr.total_with_vat
  FROM monthly_reports mr
  JOIN pt_users pu ON pu.id = mr.pt_user_id
  JOIN profiles p ON p.id = pu.profile_id
  WHERE mr.year_month = TO_CHAR(pu.created_at + interval '1 month', 'YYYY-MM')
    AND mr.period_start IS NULL
    AND mr.api_verified = true
    AND mr.fee_payment_status != 'paid'
)
-- 보고서 리셋 (검토 대기 → 사용자 재제출 가능)
, report_reset AS (
  UPDATE monthly_reports
  SET
    payment_status = 'submitted',
    fee_payment_status = NULL,
    fee_payment_deadline = NULL,
    reviewed_at = NULL,
    api_verified = false,
    api_settlement_data = NULL,
    input_source = 'manual_approved'
  WHERE id IN (SELECT report_id FROM affected)
  RETURNING id
)
-- 결제 락 해제 (좀비 락이 됨 — 청구할 금액이 재산출 필요하므로)
, lock_release AS (
  UPDATE pt_users
  SET
    payment_overdue_since = NULL,
    payment_lock_level = 0,
    payment_retry_in_progress = false,
    program_access_active = true
  WHERE id IN (SELECT pt_user_id FROM affected)
    AND admin_override_level IS NULL
  RETURNING id
)
SELECT
  a.email AS 사용자,
  TO_CHAR(a.join_date, 'YYYY-MM-DD') AS 가입일,
  a.reported_revenue AS 잘못_보고된_매출,
  a.total_with_vat AS 잘못_청구된_금액,
  '재제출 필요 — /my/report 에서 API 자동 가져오기' AS 안내
FROM affected a
ORDER BY a.email;
