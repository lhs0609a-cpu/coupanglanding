-- trainer_trainees에 수동 연결 추적 컬럼 추가
ALTER TABLE trainer_trainees ADD COLUMN IF NOT EXISTS linked_by UUID REFERENCES profiles(id);
ALTER TABLE trainer_trainees ADD COLUMN IF NOT EXISTS link_reason TEXT;
ALTER TABLE trainer_trainees ADD COLUMN IF NOT EXISTS link_type VARCHAR(20) NOT NULL DEFAULT 'referral'
  CHECK (link_type IN ('referral', 'manual'));
ALTER TABLE trainer_trainees ADD COLUMN IF NOT EXISTS effective_from VARCHAR(7);

-- UNIQUE 제약조건을 partial unique index로 변경 (비활성 레코드 허용)
ALTER TABLE trainer_trainees DROP CONSTRAINT IF EXISTS trainer_trainees_trainee_pt_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_trainees_trainee_active
  ON trainer_trainees(trainee_pt_user_id) WHERE is_active = true;
