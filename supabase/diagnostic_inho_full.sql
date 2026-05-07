-- 인호님 가입일 + 보고서 + 정산 기간 + 매출 데이터 한 번에 확인

SELECT
  p.email,
  p.full_name,
  pu.created_at AS pt_user_created_at,
  pu.share_percentage,
  TO_CHAR(pu.created_at, 'YYYY-MM-DD') AS 가입일,
  -- 첫 대상월 = 가입 다음달
  TO_CHAR(pu.created_at + interval '1 month', 'YYYY-MM') AS 첫_정산_대상월,
  -- 인호님이 4월 보고했을 때 isInitial 인지 추정
  CASE
    WHEN TO_CHAR(pu.created_at + interval '1 month', 'YYYY-MM') = '2026-04'
      THEN '⚠ 첫 정산 (isInitial) — 가입일~4/30 합산이 맞음'
    ELSE 'OK 일반 정산 — 4/1~4/30 한 달치만'
  END AS 정산_타입,
  -- 보고서 정보
  mr.year_month,
  mr.reported_revenue AS 보고된_매출,
  mr.api_verified,
  mr.api_settlement_data->>'totalSales' AS API_매출_원본,
  jsonb_array_length(COALESCE(mr.api_settlement_data->'items', '[]'::jsonb)) AS API_정산_건수,
  mr.period_start,
  mr.period_end,
  mr.calculated_deposit AS 자동계산_수수료,
  mr.admin_deposit_amount AS 관리자확정_수수료,
  mr.total_with_vat AS 청구금액,
  mr.input_source
FROM monthly_reports mr
JOIN pt_users pu ON pu.id = mr.pt_user_id
JOIN profiles p ON p.id = pu.profile_id
WHERE mr.year_month = '2026-04'
  AND p.email = 'ihys24@naver.com';
