-- 트레이너 코칭 시스템 마이그레이션
-- trainer_messages: 트레이너 → 트레이니 메시지
-- trainer_notes: 트레이너 코칭 메모 (비공개)
-- last_active_at: 마지막 활동 추적

-- 트레이너 → 트레이니 메시지
CREATE TABLE IF NOT EXISTS trainer_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  trainee_pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  template_key TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 트레이너 코칭 메모 (비공개)
CREATE TABLE IF NOT EXISTS trainer_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  trainee_pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 마지막 활동 추적
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- RLS: trainer_messages
ALTER TABLE trainer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_messages_select" ON trainer_messages
  FOR SELECT USING (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
    OR trainee_pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trainer_messages_insert" ON trainer_messages
  FOR INSERT WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
  );

CREATE POLICY "trainer_messages_admin" ON trainer_messages
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS: trainer_notes
ALTER TABLE trainer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_notes_select" ON trainer_notes
  FOR SELECT USING (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trainer_notes_insert" ON trainer_notes
  FOR INSERT WITH CHECK (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
  );

CREATE POLICY "trainer_notes_update" ON trainer_notes
  FOR UPDATE USING (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
  );

CREATE POLICY "trainer_notes_delete" ON trainer_notes
  FOR DELETE USING (
    trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
  );

CREATE POLICY "trainer_notes_admin" ON trainer_notes
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 트레이너가 자기 트레이니의 onboarding_steps 읽기 허용
CREATE POLICY "trainer_view_trainee_onboarding" ON onboarding_steps
  FOR SELECT USING (
    pt_user_id IN (
      SELECT trainee_pt_user_id FROM trainer_trainees
      WHERE is_active = true
      AND trainer_id IN (SELECT id FROM trainers WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid()))
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_trainer_messages_trainer ON trainer_messages(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_messages_trainee ON trainer_messages(trainee_pt_user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_notes_trainer ON trainer_notes(trainer_id);
CREATE INDEX IF NOT EXISTS idx_pt_users_last_active ON pt_users(last_active_at);
