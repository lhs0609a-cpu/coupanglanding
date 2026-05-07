-- 인호님 (그리고 모든 PT) 4월 보고서 매출 출처 진단
-- 매출이 API자동인지 수동인지 + 어떤 데이터에서 나왔는지 확인

SELECT
  p.email,
  p.full_name,
  mr.year_month,
  mr.reported_revenue,
  mr.api_verified,
  mr.api_settlement_data->>'totalSales' AS api_total_sales,
  mr.api_settlement_data->>'totalSettlement' AS api_total_settlement,
  jsonb_array_length(COALESCE(mr.api_settlement_data->'items', '[]'::jsonb)) AS item_count,
  mr.calculated_deposit,
  mr.admin_deposit_amount,
  mr.total_with_vat,
  mr.fee_payment_status,
  mr.fee_payment_deadline,
  mr.created_at,
  mr.updated_at
FROM monthly_reports mr
JOIN pt_users pu ON pu.id = mr.pt_user_id
JOIN profiles p ON p.id = pu.profile_id
WHERE mr.year_month = '2026-04'
  AND (
    p.email ILIKE '%inho%'
    OR p.email ILIKE '%nainho%'
    OR p.email ILIKE '%ihys24%'
    OR p.full_name ILIKE '%인호%'
  )
ORDER BY p.email;
