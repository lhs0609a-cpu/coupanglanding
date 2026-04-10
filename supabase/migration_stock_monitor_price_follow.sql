-- ========================================================
-- 품절동기화 가격 자동 추종 (Auto Price Follow)
-- sh_stock_monitors + sh_stock_monitor_logs 확장
-- ========================================================

-- 1) sh_stock_monitors 에 가격 추종 컬럼 추가
ALTER TABLE sh_stock_monitors
  ADD COLUMN IF NOT EXISTS price_follow_rule     JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_price_last     INTEGER,
  ADD COLUMN IF NOT EXISTS our_price_last        INTEGER,
  ADD COLUMN IF NOT EXISTS price_last_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_last_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_price_change  JSONB DEFAULT NULL;

-- price_follow_rule JSONB 스키마:
-- {
--   enabled: boolean,                              -- 기본 false
--   mode: 'auto' | 'manual_approval',              -- 기본 manual_approval
--   type: 'exact' | 'markup_amount' | 'markup_percent' | 'fixed_margin',
--   amount?: number,           -- markup_amount 일 때 원 단위
--   percent?: number,          -- markup_percent 일 때 %
--   captured_margin?: number,  -- fixed_margin 첫 활성화시 자동 캡처
--   min_price?: number,        -- 하한 가드레일
--   max_price?: number,        -- 상한 가드레일
--   min_change_pct?: number,   -- 기본 1 — 이하 변동 무시
--   max_change_pct?: number,   -- 기본 30 — 이상 변동 플래그
--   follow_down?: boolean,     -- 기본 true — 하락 추종
--   cooldown_minutes?: number  -- 기본 60
-- }

-- 2) sh_stock_monitor_logs event_type 체크 확장
ALTER TABLE sh_stock_monitor_logs
  DROP CONSTRAINT IF EXISTS sh_stock_monitor_logs_event_type_check;
ALTER TABLE sh_stock_monitor_logs
  ADD CONSTRAINT sh_stock_monitor_logs_event_type_check
  CHECK (event_type IN (
    'source_sold_out','source_restocked','source_removed',
    'coupang_suspended','coupang_resumed',
    'check_error','check_ok',
    'price_changed_source','price_updated_coupang',
    'price_update_skipped','price_update_flagged',
    'price_update_failed','price_update_pending',
    'price_approved','price_rejected'
  ));

-- 3) sh_stock_monitor_logs 에 가격 필드 추가
ALTER TABLE sh_stock_monitor_logs
  ADD COLUMN IF NOT EXISTS source_price_before INTEGER,
  ADD COLUMN IF NOT EXISTS source_price_after  INTEGER,
  ADD COLUMN IF NOT EXISTS our_price_before    INTEGER,
  ADD COLUMN IF NOT EXISTS our_price_after     INTEGER,
  ADD COLUMN IF NOT EXISTS price_skip_reason   TEXT;

-- 4) 인덱스
CREATE INDEX IF NOT EXISTS idx_stock_monitors_pending_price
  ON sh_stock_monitors(megaload_user_id)
  WHERE pending_price_change IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_monitor_logs_price_events
  ON sh_stock_monitor_logs(monitor_id, created_at DESC)
  WHERE event_type LIKE 'price_%';
