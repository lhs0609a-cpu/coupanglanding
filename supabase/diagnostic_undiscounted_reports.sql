-- 할인 미반영 보고서 진단 — supply_amount = admin_deposit_amount (할인 누락 패턴)
-- 정상이면: supply_amount = admin_deposit_amount - listing_discount_amount
-- 사고 패턴: supply_amount = admin_deposit_amount → 할인 미반영

SELECT
  p.email,
  p.full_name,
  mr.year_month,
  mr.reported_revenue,
  mr.calculated_deposit,
  mr.admin_deposit_amount,
  mr.supply_amount,
  mr.vat_amount,
  mr.total_with_vat,
  -- 할인 미반영 추정: total_with_vat ≈ admin_deposit * 1.1
  ROUND(mr.admin_deposit_amount * 1.1) AS expected_undiscounted,
  CASE
    WHEN ABS(mr.total_with_vat - ROUND(mr.admin_deposit_amount * 1.1)) <= 2
      THEN '⚠ 할인 미반영 의심 (total_with_vat = admin_deposit × 1.1)'
    WHEN mr.total_with_vat < mr.admin_deposit_amount * 1.05
      THEN 'OK 할인 반영됨'
    ELSE 'OK 또는 추가 비용'
  END AS diagnosis,
  mr.fee_payment_status,
  mr.payment_status
FROM monthly_reports mr
JOIN pt_users pu ON pu.id = mr.pt_user_id
JOIN profiles p ON p.id = pu.profile_id
WHERE mr.payment_status = 'reviewed'
  AND mr.fee_payment_status IN ('awaiting_payment', 'overdue', 'suspended')
  AND mr.total_with_vat > 0
ORDER BY mr.year_month DESC, p.email;
