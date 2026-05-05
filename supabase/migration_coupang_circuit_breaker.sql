-- Coupang API circuit breaker — vendor 단위 자동 차단/해제
-- 목적: IP 미등록 셀러를 매 cron마다 무한 retry해 비용 폭증하는 문제 차단
-- 동작: 403 IP 차단 응답 받으면 6시간 backoff, 다음 cron 24회 skip

ALTER TABLE pt_users
  ADD COLUMN IF NOT EXISTS coupang_api_error_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupang_api_blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS coupang_api_last_error text;

COMMENT ON COLUMN pt_users.coupang_api_error_count IS '연속 API 실패 카운트 (성공 시 0으로 리셋)';
COMMENT ON COLUMN pt_users.coupang_api_blocked_until IS 'circuit breaker — 이 시각 전까지 cron에서 skip';
COMMENT ON COLUMN pt_users.coupang_api_last_error IS '최근 에러 메시지 (UI 안내용, 500자 이내)';

-- cron 차단 셀러 빠른 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_pt_users_coupang_active
  ON pt_users (coupang_api_blocked_until)
  WHERE coupang_api_connected = true;
