-- 셀러 아레나 (게이미피케이션) 마이그레이션

-- 1. seller_points: 유저당 1행, 메인 스코어보드
CREATE TABLE IF NOT EXISTS seller_points (
  pt_user_id UUID PRIMARY KEY REFERENCES pt_users(id) ON DELETE CASCADE,
  anonymous_name TEXT,
  anonymous_emoji TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  total_listings INTEGER NOT NULL DEFAULT 0,
  total_revenue BIGINT NOT NULL DEFAULT 0,
  total_days_active INTEGER NOT NULL DEFAULT 0,
  weekly_rank INTEGER,
  monthly_rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. seller_daily_activity: 일별 활동 로그
CREATE TABLE IF NOT EXISTS seller_daily_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  listings_count INTEGER NOT NULL DEFAULT 0,
  revenue_amount BIGINT NOT NULL DEFAULT 0,
  points_listings INTEGER NOT NULL DEFAULT 0,
  points_revenue INTEGER NOT NULL DEFAULT 0,
  points_streak INTEGER NOT NULL DEFAULT 0,
  points_challenge INTEGER NOT NULL DEFAULT 0,
  points_total INTEGER NOT NULL DEFAULT 0,
  data_source TEXT NOT NULL DEFAULT 'manual' CHECK (data_source IN ('manual', 'api', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, activity_date)
);

-- 3. seller_achievements: 달성한 업적
CREATE TABLE IF NOT EXISTS seller_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, achievement_key)
);

-- 4. seller_challenges: 관리자 생성 챌린지
CREATE TABLE IF NOT EXISTS seller_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('weekly', 'monthly', 'special')),
  metric TEXT NOT NULL CHECK (metric IN ('listings', 'revenue', 'streak', 'points')),
  target_value INTEGER NOT NULL,
  reward_points INTEGER NOT NULL DEFAULT 0,
  reward_badge TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. seller_challenge_progress: 챌린지 진행도
CREATE TABLE IF NOT EXISTS seller_challenge_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES seller_challenges(id) ON DELETE CASCADE,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  current_value INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  UNIQUE(challenge_id, pt_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seller_daily_activity_user ON seller_daily_activity(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_seller_daily_activity_date ON seller_daily_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_seller_achievements_user ON seller_achievements(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_seller_challenges_active ON seller_challenges(is_active, end_date);
CREATE INDEX IF NOT EXISTS idx_seller_challenge_progress_challenge ON seller_challenge_progress(challenge_id);
CREATE INDEX IF NOT EXISTS idx_seller_challenge_progress_user ON seller_challenge_progress(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_seller_points_weekly_rank ON seller_points(weekly_rank) WHERE weekly_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seller_points_monthly_rank ON seller_points(monthly_rank) WHERE monthly_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seller_points_total ON seller_points(total_points DESC);

-- RLS
ALTER TABLE seller_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_daily_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_challenge_progress ENABLE ROW LEVEL SECURITY;

-- seller_points policies
CREATE POLICY "Users can view all seller_points for leaderboard" ON seller_points FOR SELECT USING (true);
CREATE POLICY "Admin can manage seller_points" ON seller_points FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- seller_daily_activity policies
CREATE POLICY "Users can view own daily_activity" ON seller_daily_activity FOR SELECT USING (
  pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
);
CREATE POLICY "Users can insert own daily_activity" ON seller_daily_activity FOR INSERT WITH CHECK (
  pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
);
CREATE POLICY "Admin can manage daily_activity" ON seller_daily_activity FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- seller_achievements policies
CREATE POLICY "Users can view own achievements" ON seller_achievements FOR SELECT USING (
  pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
);
CREATE POLICY "Admin can manage achievements" ON seller_achievements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- seller_challenges policies (visible to all authenticated users)
CREATE POLICY "Authenticated users can view active challenges" ON seller_challenges FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage challenges" ON seller_challenges FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- seller_challenge_progress policies
CREATE POLICY "Users can view own challenge_progress" ON seller_challenge_progress FOR SELECT USING (
  pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
);
CREATE POLICY "Admin can manage challenge_progress" ON seller_challenge_progress FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_seller_points_updated_at') THEN
    CREATE TRIGGER set_seller_points_updated_at BEFORE UPDATE ON seller_points FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_seller_daily_activity_updated_at') THEN
    CREATE TRIGGER set_seller_daily_activity_updated_at BEFORE UPDATE ON seller_daily_activity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
