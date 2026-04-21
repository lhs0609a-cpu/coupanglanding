-- PT 테스터 계정 플래그
-- true 로 설정 시:
--   1) auto-billing 크론이 해당 유저 완전 skip (결제 시도 안 함)
--   2) 미들웨어가 lock 계산 건너뜀 (차단 없음, 모든 쓰기 허용)
--   3) DashboardLayout 결제 관련 팝업/배너 전부 숨김
--   4) admin-overdue/settlement-reminders 알림 제외
--
-- 관리자 UI (/admin/payment-locks) 의 '테스트 계정 토글' 버튼으로 관리.

ALTER TABLE pt_users
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pt_users_is_test_account
  ON pt_users (is_test_account) WHERE is_test_account = TRUE;

COMMENT ON COLUMN pt_users.is_test_account IS
  '테스트 계정 여부. true 면 결제/락/팝업/알림 전부 면제, 모든 기능 정상 동작.';
