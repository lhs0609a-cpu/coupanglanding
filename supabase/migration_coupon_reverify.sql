-- ============================================================
-- 방법 A: 과거 가짜 success 다운로드 쿠폰 재검증·복구 진행 마커
--   coupon-reverify 크론이 유저별로 1회 재검증했는지 추적해 중복 처리 방지.
-- ============================================================

ALTER TABLE coupon_auto_sync_config
  ADD COLUMN IF NOT EXISTS download_reverified_at TIMESTAMPTZ;

COMMENT ON COLUMN coupon_auto_sync_config.download_reverified_at
  IS '다운로드 쿠폰 NOT_FOUND 재검증·리셋(방법A)을 마지막으로 완료한 시각. null=미처리';

-- 미처리 유저 빠른 조회
CREATE INDEX IF NOT EXISTS idx_coupon_config_reverify_pending
  ON coupon_auto_sync_config (download_reverified_at)
  WHERE download_reverified_at IS NULL;

NOTIFY pgrst, 'reload schema';
