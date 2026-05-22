-- ============================================================
-- 쿠팡 애즈(광고) 자동화 — 입찰가 자동조정 (P1 스키마)
-- ------------------------------------------------------------
-- 쿠팡 애즈는 캠페인/입찰 관리 API가 일반 셀러에게 없으므로,
-- 로컬 워커(Electron+Chromium)가 윙 광고화면을 직접 조작한다.
--   - megaload_ad_rules     : 계정/캠페인별 자동조정 규칙(목표ROAS·입찰한도 등)
--   - megaload_ad_metrics   : 워커가 수집한 광고 성과(P2에서 채움)
--   - megaload_ad_bid_changes: 입찰 변경 제안·승인·적용 이력(드라이런/승인/자동)
-- 워커는 service_role 없이 "사용자 JWT"로 접근 → RLS로 본인 데이터만 강제.
-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 이 파일 전체 실행
-- ============================================================

-- ── 1) 규칙 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS megaload_ad_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  -- 적용 범위: account(계정 전체 기본값) / campaign / keyword
  scope_type TEXT NOT NULL DEFAULT 'account'
    CHECK (scope_type IN ('account','campaign','keyword')),
  scope_id TEXT,                                    -- 캠페인/키워드 식별자 (account이면 NULL)
  scope_label TEXT,                                 -- 표시용 이름

  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- dryrun: 변경안만 기록 / approval: 사람 승인 후 적용 / auto: 즉시 적용
  mode TEXT NOT NULL DEFAULT 'dryrun'
    CHECK (mode IN ('dryrun','approval','auto')),

  target_roas NUMERIC NOT NULL DEFAULT 300,         -- 목표 ROAS(%) — 300 = 매출이 광고비의 3배
  roas_tolerance_pct NUMERIC NOT NULL DEFAULT 15,   -- 목표 대비 ±여유(%) 안이면 유지
  min_bid INT NOT NULL DEFAULT 100,                 -- 입찰가 절대 하한(원)
  max_bid INT NOT NULL DEFAULT 2000,                -- 입찰가 절대 상한(원)
  step_pct NUMERIC NOT NULL DEFAULT 10,             -- 1회 조정 폭(%)
  daily_max_change_pct NUMERIC NOT NULL DEFAULT 30, -- 하루 누적 변동 상한(%)
  lookback_days INT NOT NULL DEFAULT 7,             -- 성과 평가 기간(일)

  active_hours JSONB,                               -- {"start":9,"end":23} (NULL이면 24h)
  pause_on_zero_conv BOOLEAN NOT NULL DEFAULT TRUE, -- 전환0인데 비용만 나가면 강하게 인하/OFF
  zero_conv_min_clicks INT NOT NULL DEFAULT 30,
  zero_conv_min_spend INT NOT NULL DEFAULT 10000,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (megaload_user_id, scope_type, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_rules_user ON megaload_ad_rules(megaload_user_id, enabled);

-- ── 2) 성과 메트릭 (워커 수집 — P2) ──────────────────────────
CREATE TABLE IF NOT EXISTS megaload_ad_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  keyword TEXT,                                     -- 키워드 단위면 채움, 캠페인 합계면 NULL
  metric_date DATE NOT NULL,
  impressions INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  spend NUMERIC NOT NULL DEFAULT 0,                 -- 광고비(원)
  sales NUMERIC NOT NULL DEFAULT 0,                 -- 광고 전환매출(원)
  conversions INT NOT NULL DEFAULT 0,
  roas NUMERIC,                                     -- sales/spend*100 (수집 시 계산해 저장)
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (megaload_user_id, campaign_id, keyword, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_lookup
  ON megaload_ad_metrics(megaload_user_id, campaign_id, metric_date);

-- ── 3) 입찰 변경 이력/제안 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS megaload_ad_bid_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES megaload_ad_rules(id) ON DELETE SET NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  keyword TEXT,
  before_bid INT,
  after_bid INT,
  measured_roas NUMERIC,
  reason TEXT,                                      -- "ROAS 420% > 목표 345% → +10%" 등 사람이 읽는 사유
  -- proposed: 제안됨 / approved: 승인(적용대기) / applied: 적용완료 / rejected: 거절 / failed: 적용실패 / skipped: 한도로 스킵
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','applied','rejected','failed','skipped')),
  screenshot_url TEXT,                              -- 적용 전/후 증빙(선택)
  error_message TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,                           -- 승인/거절 시각
  applied_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ad_changes_user_status
  ON megaload_ad_bid_changes(megaload_user_id, status, created_at DESC);

-- ── RLS: 본인(megaload_users.profile_id = auth.uid())만 ──────
ALTER TABLE megaload_ad_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE megaload_ad_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE megaload_ad_bid_changes ENABLE ROW LEVEL SECURITY;

-- 공통 헬퍼식: megaload_user_id 가 내 것인지
--   (SELECT id FROM megaload_users WHERE profile_id = auth.uid())

-- megaload_ad_rules
DROP POLICY IF EXISTS ad_rules_select_own ON megaload_ad_rules;
CREATE POLICY ad_rules_select_own ON megaload_ad_rules FOR SELECT TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_rules_insert_own ON megaload_ad_rules;
CREATE POLICY ad_rules_insert_own ON megaload_ad_rules FOR INSERT TO authenticated
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_rules_update_own ON megaload_ad_rules;
CREATE POLICY ad_rules_update_own ON megaload_ad_rules FOR UPDATE TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_rules_delete_own ON megaload_ad_rules;
CREATE POLICY ad_rules_delete_own ON megaload_ad_rules FOR DELETE TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

-- megaload_ad_metrics
DROP POLICY IF EXISTS ad_metrics_select_own ON megaload_ad_metrics;
CREATE POLICY ad_metrics_select_own ON megaload_ad_metrics FOR SELECT TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_metrics_insert_own ON megaload_ad_metrics;
CREATE POLICY ad_metrics_insert_own ON megaload_ad_metrics FOR INSERT TO authenticated
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_metrics_update_own ON megaload_ad_metrics;
CREATE POLICY ad_metrics_update_own ON megaload_ad_metrics FOR UPDATE TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

-- megaload_ad_bid_changes
DROP POLICY IF EXISTS ad_changes_select_own ON megaload_ad_bid_changes;
CREATE POLICY ad_changes_select_own ON megaload_ad_bid_changes FOR SELECT TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_changes_insert_own ON megaload_ad_bid_changes;
CREATE POLICY ad_changes_insert_own ON megaload_ad_bid_changes FOR INSERT TO authenticated
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_changes_update_own ON megaload_ad_bid_changes;
CREATE POLICY ad_changes_update_own ON megaload_ad_bid_changes FOR UPDATE TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON megaload_ad_rules       TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON megaload_ad_metrics     TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON megaload_ad_bid_changes TO authenticated;
