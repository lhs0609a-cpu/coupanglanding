-- =============================================
-- 멀티채널 자동전파 — 누락된 기반 테이블 백필
--
-- 배경: migration_multichannel_autofanout / _p2 / _p3 는 프로덕션에 실행됐으나,
--       이들이 전제하는 기반 테이블(sh_replication_jobs, sh_channel_margin_settings)을
--       만드는 migration_multi_channel_expansion.sql 이 실행된 적 없음 (2026-08-18 실측).
--       → enqueue insert 가 항상 실패 → 러너는 영원히 "처리할 잡 없음" → 전파 0건.
--
-- 이 파일은 expansion 의 2~5절만 이식한다.
--   · 1절(channel CHECK 재정의)은 의도적으로 제외 — 그 절은 temu 가 빠진 옛 목록이라
--     지금 실행하면 migration_temu_channel.sql 이 넣어둔 temu 를 도로 떨어뜨린다(회귀).
--   · 전부 IF NOT EXISTS / DROP POLICY IF EXISTS 로 재실행 안전.
-- =============================================

-- ─────────────────────────────────────────────
-- 1. 복제 잡 큐
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sh_replication_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  source_channel TEXT NOT NULL DEFAULT 'coupang',
  target_channels TEXT[] NOT NULL,
  product_ids UUID[] NOT NULL,
  margin_settings JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  total INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error_log JSONB NOT NULL DEFAULT '[]',
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
-- 2. 채널별 마진 설정  (temu 포함 — 현행 채널 목록 기준)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sh_channel_margin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon','temu','toss','kakao')),
  margin_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(megaload_user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_sh_channel_margin_user
  ON sh_channel_margin_settings(megaload_user_id);

-- ─────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────

ALTER TABLE sh_replication_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_channel_margin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "user_select_own_replication_jobs" ON sh_replication_jobs
  FOR SELECT USING (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "user_insert_own_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "user_insert_own_replication_jobs" ON sh_replication_jobs
  FOR INSERT WITH CHECK (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "user_update_own_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "user_update_own_replication_jobs" ON sh_replication_jobs
  FOR UPDATE USING (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_all_replication_jobs" ON sh_replication_jobs;
CREATE POLICY "admin_all_replication_jobs" ON sh_replication_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "user_select_own_margins" ON sh_channel_margin_settings;
CREATE POLICY "user_select_own_margins" ON sh_channel_margin_settings
  FOR SELECT USING (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "user_upsert_own_margins" ON sh_channel_margin_settings;
CREATE POLICY "user_upsert_own_margins" ON sh_channel_margin_settings
  FOR ALL USING (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  ) WITH CHECK (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- 4. updated_at 트리거
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

-- ─────────────────────────────────────────────
-- 5. 검증
-- ─────────────────────────────────────────────
SELECT
  to_regclass('public.sh_replication_jobs')        AS jobs_table,
  to_regclass('public.sh_channel_margin_settings') AS margin_table;
