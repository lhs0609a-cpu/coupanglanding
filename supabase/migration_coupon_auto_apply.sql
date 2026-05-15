-- ============================================================
-- 5일 주기 쿠폰 자동 적용 — coupon_auto_sync_config 컬럼 확장
-- ============================================================

ALTER TABLE coupon_auto_sync_config
  ADD COLUMN IF NOT EXISTS auto_apply_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_apply_cycle_days INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_auto_apply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_auto_apply_summary JSONB;

-- 5일 주기 처리 대상 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_coupon_auto_sync_config_auto_apply
  ON coupon_auto_sync_config (auto_apply_enabled, last_auto_apply_at)
  WHERE auto_apply_enabled = true;

COMMENT ON COLUMN coupon_auto_sync_config.auto_apply_enabled IS '5일 주기 자동 쿠폰 적용 활성화 여부';
COMMENT ON COLUMN coupon_auto_sync_config.auto_apply_cycle_days IS '자동 적용 주기 (일)';
COMMENT ON COLUMN coupon_auto_sync_config.last_auto_apply_at IS '마지막 자동 적용 완료 시각 (다음 사이클 계산 기준)';
COMMENT ON COLUMN coupon_auto_sync_config.last_auto_apply_summary IS '마지막 자동 적용 결과 요약 (collected/instant/download/error)';
