-- =============================================
-- 멀티채널 전자동 전파 — Phase 0
-- (상품 × 채널) 상태머신(FSM) + reconcile 기반 자동전파의 토대
--
-- 1) sh_product_channels FSM 컬럼/상태 확장
-- 2) megaload_users.auto_replicate_enabled (사용자별 자동전파 마스터 토글)
-- 3) reconcile 워터마크 / retry 백오프 인덱스
--
-- ⚠️ 기존 status 값(not_registered/pending/active/suspended/failed/deleted)은
--    전부 유지한다 — 기존 러너/품절동기화가 이 값들로 동작 중.
-- =============================================

-- ─────────────────────────────────────────────
-- 1. status enum 확장 (기존 값 유지 + FSM 상태 추가)
--    queued      : reconcile/hook 가 큐에 올림 (등록 대기)
--    mapping     : canonical→채널 변환 중
--    needs_input : 필수값 누락으로 보류 (예외큐 노출, 사용자 입력 대기)
--    ready       : 변환 완료, createProduct 직전
--    registering : 채널 API 호출 중 (멱등 placeholder)
--    stale       : 쿠팡 원본 변경 감지 → 재push 필요
-- ─────────────────────────────────────────────

ALTER TABLE sh_product_channels DROP CONSTRAINT IF EXISTS sh_product_channels_status_check;
ALTER TABLE sh_product_channels ADD CONSTRAINT sh_product_channels_status_check
  CHECK (status IN (
    'not_registered','pending','active','suspended','failed','deleted',
    'queued','mapping','needs_input','ready','registering','stale'
  ));

-- ─────────────────────────────────────────────
-- 2. FSM 메타 컬럼
--    mapping_hash      : 현재 등록된 canonical 스냅샷 해시 (변경/중복 감지)
--    last_pushed_hash  : 마지막으로 채널에 push 한 해시 (drift / 재push 판정)
--    attempt_count     : 등록 시도 횟수 (지수 백오프 / 영구실패 판정)
--    next_retry_at     : 다음 재시도 가능 시각 (백오프)
--    last_error_class  : 'permanent'(키오류/반려/필수값) vs 'transient'(429/5xx/timeout)
--    needs_input_fields: 막힌 필수값 목록 (예: ["category","kc_cert","ship_template"])
-- ─────────────────────────────────────────────

ALTER TABLE sh_product_channels
  ADD COLUMN IF NOT EXISTS mapping_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_pushed_hash TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_class TEXT,
  ADD COLUMN IF NOT EXISTS needs_input_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────
-- 3. 사용자별 자동전파 마스터 토글
--    true 인 사용자만 reconcile 가 쿠팡→타채널 자동 전파를 수행.
--    (채널별 on/off·마진은 기존 sh_channel_margin_settings 재사용 — P2 UI)
-- ─────────────────────────────────────────────

ALTER TABLE megaload_users
  ADD COLUMN IF NOT EXISTS auto_replicate_enabled BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────
-- 4. 인덱스
-- ─────────────────────────────────────────────

-- 재시도 대상(백오프 경과한 failed/queued) 빠른 조회
CREATE INDEX IF NOT EXISTS idx_spc_retry
  ON sh_product_channels(next_retry_at)
  WHERE status IN ('failed','queued');

-- reconcile: 상품별 채널 커버리지 조회
CREATE INDEX IF NOT EXISTS idx_spc_product_status
  ON sh_product_channels(product_id, channel, status);

-- reconcile 워터마크: 쿠팡 active 상품 최신순 스캔
CREATE INDEX IF NOT EXISTS idx_sh_products_user_active_updated
  ON sh_products(megaload_user_id, status, updated_at DESC)
  WHERE coupang_product_id IS NOT NULL;
