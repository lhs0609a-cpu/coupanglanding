-- 파트너 본인 계약 탈퇴 기능: contracts 테이블에 탈퇴 관련 컬럼 추가
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_evidence_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_status TEXT CHECK (withdrawal_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_rejected_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_approved_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawal_reviewed_by UUID REFERENCES profiles(id);
