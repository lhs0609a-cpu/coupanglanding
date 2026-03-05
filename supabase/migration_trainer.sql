-- ============================================
-- 트레이너 시스템 마이그레이션
-- ============================================

-- 1. trainers 테이블
CREATE TABLE IF NOT EXISTS trainers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL UNIQUE REFERENCES pt_users(id) ON DELETE CASCADE,
  referral_code VARCHAR(20) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  bonus_percentage NUMERIC(5,2) NOT NULL DEFAULT 5,
  approved_at TIMESTAMPTZ,
  total_earnings NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. trainer_trainees 테이블
CREATE TABLE IF NOT EXISTS trainer_trainees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  trainee_pt_user_id UUID NOT NULL UNIQUE REFERENCES pt_users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. trainer_earnings 테이블
CREATE TABLE IF NOT EXISTS trainer_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  trainee_pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  monthly_report_id UUID NOT NULL UNIQUE REFERENCES monthly_reports(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  trainee_net_profit NUMERIC(12,0) NOT NULL DEFAULT 0,
  bonus_percentage NUMERIC(5,2) NOT NULL DEFAULT 5,
  bonus_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'confirmed', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. applications 테이블에 referral_code 컬럼 추가
ALTER TABLE applications ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);

-- 5. RLS 정책

-- trainers RLS
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainers_select_own" ON trainers
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trainers_admin_all" ON trainers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- trainer_trainees RLS
ALTER TABLE trainer_trainees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_trainees_select_own" ON trainer_trainees
  FOR SELECT USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE pt_user_id IN (
        SELECT id FROM pt_users WHERE profile_id = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trainer_trainees_admin_all" ON trainer_trainees
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- trainer_earnings RLS
ALTER TABLE trainer_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_earnings_select_own" ON trainer_earnings
  FOR SELECT USING (
    trainer_id IN (
      SELECT id FROM trainers WHERE pt_user_id IN (
        SELECT id FROM pt_users WHERE profile_id = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trainer_earnings_admin_all" ON trainer_earnings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_trainers_status ON trainers(status);
CREATE INDEX IF NOT EXISTS idx_trainers_referral_code ON trainers(referral_code);
CREATE INDEX IF NOT EXISTS idx_trainer_trainees_trainer_id ON trainer_trainees(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_earnings_trainer_id ON trainer_earnings(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_earnings_year_month ON trainer_earnings(year_month);
CREATE INDEX IF NOT EXISTS idx_applications_referral_code ON applications(referral_code);
