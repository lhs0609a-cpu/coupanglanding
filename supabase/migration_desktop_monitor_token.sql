-- ============================================================
-- Megaload Desktop Monitor 인증 토큰 컬럼
--
-- 사용자가 데스크탑 앱 첫 실행 시 입력할 영구 토큰.
-- 사용자 PC IP에서 네이버를 직접 호출하기 위한 자격 증명.
-- ============================================================

ALTER TABLE megaload_users
  ADD COLUMN IF NOT EXISTS desktop_app_token TEXT,
  ADD COLUMN IF NOT EXISTS desktop_app_token_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS desktop_app_last_heartbeat TIMESTAMPTZ;

-- 토큰 unique 인덱스 (조회 빈번 + 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_megaload_users_desktop_app_token
  ON megaload_users (desktop_app_token)
  WHERE desktop_app_token IS NOT NULL;

-- heartbeat 기준 활성 사용자 조회용
CREATE INDEX IF NOT EXISTS idx_megaload_users_desktop_heartbeat
  ON megaload_users (desktop_app_last_heartbeat DESC NULLS LAST)
  WHERE desktop_app_token IS NOT NULL;

COMMENT ON COLUMN megaload_users.desktop_app_token IS '데스크탑 앱 인증 토큰 (64자 hex, 7일 만료)';
COMMENT ON COLUMN megaload_users.desktop_app_token_issued_at IS '토큰 발급 시각 (만료 계산 기준)';
COMMENT ON COLUMN megaload_users.desktop_app_last_heartbeat IS '데스크탑 앱 최근 ping 시각 (활성 여부 판단)';

-- sh_stock_monitor_logs 의 event_type CHECK 제약 확장 (있으면)
-- desktop_check 이벤트 타입 추가
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sh_stock_monitor_logs'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%event_type%'
  ) THEN
    -- 기존 CHECK 있으면 ALTER 시 별도 처리 필요. 우선 NOTICE만.
    RAISE NOTICE 'sh_stock_monitor_logs.event_type CHECK 제약 존재 — desktop_check 추가 필요 시 수동 ALTER';
  END IF;
END $$;
