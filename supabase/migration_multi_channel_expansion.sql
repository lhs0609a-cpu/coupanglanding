-- =============================================
-- 멀티채널 확장 (Phase 1-3)
-- 1) 토스/카카오 채널 enum 확장
-- 2) 쿠팡 → 전채널 복제 잡 큐 (sh_replication_jobs)
-- 3) 채널별 마진 설정 (sh_channel_margin_settings)
-- =============================================

-- ─────────────────────────────────────────────
-- 1. channel enum 확장 (toss, kakao 추가)
-- ─────────────────────────────────────────────

ALTER TABLE channel_credentials DROP CONSTRAINT IF EXISTS channel_credentials_channel_check;
ALTER TABLE channel_credentials ADD CONSTRAINT channel_credentials_channel_check
  CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon','toss','kakao'));

ALTER TABLE sh_product_channels DROP CONSTRAINT IF EXISTS sh_product_channels_channel_check;
ALTER TABLE sh_product_channels ADD CONSTRAINT sh_product_channels_channel_check
  CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon','toss','kakao'));

-- ─────────────────────────────────────────────
-- 2. 복제 잡 큐
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sh_replication_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  source_channel TEXT NOT NULL DEFAULT 'coupang',
  target_channels TEXT[] NOT NULL,
  product_ids UUID[] NOT NULL,
  margin_settings JSONB NOT NULL DEFAULT '{}',  -- { naver: 0, elevenst: 5, gmarket: 3, ... }
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  total INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error_log JSONB NOT NULL DEFAULT '[]',
  -- [{ product_id, channel, error, at }]
  cursor JSONB NOT NULL DEFAULT '{"productIndex": 0, "channelIndex": 0}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sh_replication_jobs_user_status
  ON sh_replication_jobs(megaload_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sh_replication_jobs_pending
  ON sh_replication_jobs(status, created_at) WHERE status IN ('pending','running');

-- ─────────────────────────────────────────────
-- 3. 채널별 마진 설정 (사용자별로 저장)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sh_channel_margin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon','toss','kakao')),
  margin_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- 양수: 판매가 상향 / 음수: 할인 허용
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(megaload_user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_sh_channel_margin_user
  ON sh_channel_margin_settings(megaload_user_id);

-- ─────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────

ALTER TABLE sh_replication_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_channel_margin_settings ENABLE ROW LEVEL SECURITY;

-- replication_jobs: 본인 잡만 조회/생성 + 관리자 전체
DROP POLICY IF EXISTS "user_select_own_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "user_select_own_replication_jobs" ON sh_replication_jobs
  FOR SELECT USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_insert_own_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "user_insert_own_replication_jobs" ON sh_replication_jobs
  FOR INSERT WITH CHECK (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_update_own_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "user_update_own_replication_jobs" ON sh_replication_jobs
  FOR UPDATE USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_all_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "admin_all_replication_jobs" ON sh_replication_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- margin_settings: 본인 것만
DROP POLICY IF EXISTS "user_select_own_margins" ON sh_channel_margin_settings;
CREATE POLICY "user_select_own_margins" ON sh_channel_margin_settings
  FOR SELECT USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_upsert_own_margins" ON sh_channel_margin_settings;
CREATE POLICY "user_upsert_own_margins" ON sh_channel_margin_settings
  FOR ALL USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  ) WITH CHECK (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 5. updated_at 트리거
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sh_replication_jobs_updated_at ON sh_replication_jobs;
CREATE TRIGGER trg_sh_replication_jobs_updated_at
  BEFORE UPDATE ON sh_replication_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

DROP TRIGGER IF EXISTS trg_sh_channel_margin_updated_at ON sh_channel_margin_settings;
CREATE TRIGGER trg_sh_channel_margin_updated_at
  BEFORE UPDATE ON sh_channel_margin_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
