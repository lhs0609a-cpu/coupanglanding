-- 계약 종료 + 상품 철거 플로우 지원을 위한 마이그레이션
-- Feature 3: 계약 해지 시 상품 철거 의무 안내

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS termination_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_deactivation_deadline TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_deactivation_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_deactivation_evidence_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS termination_acknowledged_at TIMESTAMPTZ;
