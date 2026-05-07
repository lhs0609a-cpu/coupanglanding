-- 인호님 4월 보고서를 미제출 상태로 리셋
-- 이유: api_verified=true 가짜 통과 + period_start/end 누락 + 사용자 임의 입력값 ₩2,510,200
-- 인호님이 다시 /my/report 가서 API 자동 가져오기 → 3/13~4/30 제대로 조회 → 재제출 가능하게 함

-- 백업 (선택) — 실행 전 현재 값 보존하고 싶으면 먼저 백업 테이블에 INSERT
-- CREATE TABLE IF NOT EXISTS monthly_reports_backup AS SELECT * FROM monthly_reports WHERE false;
-- INSERT INTO monthly_reports_backup
--   SELECT * FROM monthly_reports
--   WHERE pt_user_id = (SELECT id FROM pt_users WHERE profile_id = (SELECT id FROM profiles WHERE email = 'ihys24@naver.com'))
--     AND year_month = '2026-04';

UPDATE monthly_reports
SET
  payment_status = 'submitted',  -- reviewed → submitted (재검토 필요)
  fee_payment_status = NULL,     -- 결제 대기 해제
  fee_payment_deadline = NULL,
  reviewed_at = NULL,
  api_verified = false,
  api_settlement_data = NULL,
  input_source = 'manual_approved',
  -- 매출/비용은 그대로 두되, 사용자가 다시 API 호출하면 덮어씌워짐
  period_start = NULL,
  period_end = NULL
WHERE pt_user_id = (
  SELECT pu.id FROM pt_users pu
  JOIN profiles p ON p.id = pu.profile_id
  WHERE p.email = 'ihys24@naver.com'
)
  AND year_month = '2026-04'
  AND fee_payment_status != 'paid'  -- 이미 결제됐으면 건드리지 않음 (회계 무결성)
RETURNING id, payment_status, fee_payment_status, api_verified;
