-- ============================================================
-- 관리자 통합 로그 (system_logs) — 시스템 전반 오류·경고 한 곳에 모음
--
-- 자동 분류:
--   level: error / warn / info
--   category: coupang_api / supabase / payment / auth / cron / megaload / build / network / other
--   source: API 라우트 path 또는 backend module name
--   fingerprint: hash(source + normalized message) — 동일 오류 N회 카운트
--
-- 관리자가 /admin/system-logs 에서:
--   1) 통계 카드 (오늘 errors / 미해결 / 카테고리별)
--   2) 필터 (level / category / 미해결만)
--   3) 동일 fingerprint 묶기 (count 컬럼)
--   4) "해결됨" 마킹 (resolved + resolved_by + resolved_at)
-- ============================================================

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  category TEXT NOT NULL,                                 -- coupang_api / supabase / payment / auth / cron / megaload / build / network / other
  source TEXT NOT NULL,                                   -- API path 또는 module 이름
  message TEXT NOT NULL,                                  -- 사용자에게 보일 메시지 (문자열로 정규화)
  context JSONB NOT NULL DEFAULT '{}',                    -- raw error/stack/request 등 임의 데이터
  fingerprint TEXT NOT NULL,                              -- hash(source + message_normalized) — dedup
  occurrences INTEGER NOT NULL DEFAULT 1,                 -- 같은 fingerprint 누적 카운트
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolution_hint TEXT,                                   -- 알려진 해결 가이드 (자동 추론)
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT,
  user_id UUID REFERENCES profiles(id),                   -- 오류 발생 시점 인증된 사용자 (있으면)
  request_id TEXT                                         -- request 추적 ID (있으면)
);

CREATE INDEX IF NOT EXISTS idx_system_logs_ts ON system_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_resolved ON system_logs(level, resolved, ts DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category, ts DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_fingerprint ON system_logs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_system_logs_unresolved_recent ON system_logs(ts DESC) WHERE resolved = false;

-- RLS — 관리자만 접근
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_system_logs" ON system_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 동일 fingerprint upsert 헬퍼 함수 — occurrences 누적 + last_seen_at 갱신
CREATE OR REPLACE FUNCTION upsert_system_log(
  p_level TEXT,
  p_category TEXT,
  p_source TEXT,
  p_message TEXT,
  p_context JSONB,
  p_fingerprint TEXT,
  p_resolution_hint TEXT,
  p_user_id UUID,
  p_request_id TEXT
) RETURNS UUID AS $$
DECLARE
  existing_id UUID;
BEGIN
  -- 같은 fingerprint + 미해결 row 가 있으면 누적 업데이트
  SELECT id INTO existing_id
  FROM system_logs
  WHERE fingerprint = p_fingerprint
    AND resolved = false
    -- 24시간 내 동일 오류만 묶음 (이전엔 새 row 로 분리)
    AND last_seen_at > now() - INTERVAL '24 hours'
  ORDER BY last_seen_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE system_logs
    SET occurrences = occurrences + 1,
        last_seen_at = now(),
        message = p_message,
        context = p_context,
        resolution_hint = COALESCE(p_resolution_hint, resolution_hint)
    WHERE id = existing_id;
    RETURN existing_id;
  ELSE
    INSERT INTO system_logs (
      level, category, source, message, context, fingerprint,
      resolution_hint, user_id, request_id
    ) VALUES (
      p_level, p_category, p_source, p_message, p_context, p_fingerprint,
      p_resolution_hint, p_user_id, p_request_id
    ) RETURNING id INTO existing_id;
    RETURN existing_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION upsert_system_log TO authenticated, service_role;
