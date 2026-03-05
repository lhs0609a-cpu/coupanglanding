-- 쿠팡 Open API 연동을 위한 마이그레이션
-- pt_users 테이블에 API 자격증명 필드 추가
ALTER TABLE pt_users
  ADD COLUMN IF NOT EXISTS coupang_vendor_id TEXT,
  ADD COLUMN IF NOT EXISTS coupang_access_key TEXT,
  ADD COLUMN IF NOT EXISTS coupang_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS coupang_api_connected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coupang_api_key_expires_at TIMESTAMPTZ;

-- monthly_reports 테이블에 API 검증 필드 추가
ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS api_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS api_settlement_data JSONB;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_monthly_reports_api_verified
  ON monthly_reports (api_verified) WHERE api_verified = TRUE;
