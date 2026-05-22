-- ============================================================
-- 쿠팡 애즈 자동화 B단계 — 지는 광고 자동 OFF/삭제 + 아이템 자동 등록
-- ------------------------------------------------------------
-- A(입찰 자동조정)에 이어:
--   B-1: 광고비 N원 소진 & 판매 0 → 캠페인 OFF, OFF 후 N일 개선 없으면 삭제
--   B-2: (신규)상품을 광고 캠페인에 자동 등록 — 예산/개수 상한으로 폭증 방지
-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 이 파일 전체 실행
-- ============================================================

-- ── 규칙 확장 (megaload_ad_rules) ────────────────────────────
ALTER TABLE megaload_ad_rules
  -- B-1: 자동 OFF
  ADD COLUMN IF NOT EXISTS auto_off_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS off_spend_threshold INT     NOT NULL DEFAULT 10000, -- 누적 광고비(원) 초과 &
  ADD COLUMN IF NOT EXISTS off_max_sales       INT     NOT NULL DEFAULT 0,     -- 전환매출(원)이 이 값 이하면 OFF
  -- B-1: 자동 삭제 (OFF 후 N일 개선 없으면)
  ADD COLUMN IF NOT EXISTS auto_delete_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delete_after_off_days INT     NOT NULL DEFAULT 7,
  -- B-2: 아이템 자동 등록
  ADD COLUMN IF NOT EXISTS auto_register_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS register_scope        TEXT    NOT NULL DEFAULT 'selected'
    CHECK (register_scope IN ('selected','all_new')),                          -- 내가 고른 / 신규 전체
  ADD COLUMN IF NOT EXISTS register_initial_bid  INT     NOT NULL DEFAULT 200, -- 초기 입찰가(원)
  -- ★ 광고비 폭증 방지 가드레일 ★
  ADD COLUMN IF NOT EXISTS register_daily_budget INT     NOT NULL DEFAULT 5000,-- 상품당 일 예산(원)
  ADD COLUMN IF NOT EXISTS register_max_per_day  INT     NOT NULL DEFAULT 10,  -- 하루 자동등록 개수 상한
  ADD COLUMN IF NOT EXISTS global_daily_budget_cap INT;                        -- 전체 광고 일예산 상한(원, NULL=무제한)

-- ── 액션 종류 (입찰뿐 아니라 off/delete 도 기록) ─────────────
ALTER TABLE megaload_ad_bid_changes
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'bid';                 -- bid | off | delete

-- ── 자동 등록 큐 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS megaload_ad_register_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  product_code TEXT,
  product_name TEXT,
  coupang_product_id TEXT,
  initial_bid INT,
  daily_budget INT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','error','skipped','canceled')),
  campaign_id TEXT,                                  -- 생성/연결된 캠페인 id
  error_message TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (megaload_user_id, coupang_product_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_regq_user_status
  ON megaload_ad_register_queue(megaload_user_id, status, created_at);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE megaload_ad_register_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_regq_select_own ON megaload_ad_register_queue;
CREATE POLICY ad_regq_select_own ON megaload_ad_register_queue FOR SELECT TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_regq_insert_own ON megaload_ad_register_queue;
CREATE POLICY ad_regq_insert_own ON megaload_ad_register_queue FOR INSERT TO authenticated
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS ad_regq_update_own ON megaload_ad_register_queue;
CREATE POLICY ad_regq_update_own ON megaload_ad_register_queue FOR UPDATE TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE ON megaload_ad_register_queue TO authenticated;
