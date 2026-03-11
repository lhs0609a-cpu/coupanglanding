-- 3자 계약 시스템: pt_users + contracts 컬럼 추가
-- pt_users: 사업자 관계
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS is_self_business BOOLEAN DEFAULT TRUE;
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS business_relation TEXT;

-- contracts: 3자 계약 모드 + 사업자 서명
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_mode TEXT DEFAULT 'single';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_signed_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_signature_data TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_signed_ip TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_signer_name TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_sign_token TEXT UNIQUE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_sign_token_expires_at TIMESTAMPTZ;
