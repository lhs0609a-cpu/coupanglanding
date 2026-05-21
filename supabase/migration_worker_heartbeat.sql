-- ============================================================
-- megaload_worker_heartbeats: 로컬 GPU 워커 생존 신호
-- ------------------------------------------------------------
-- 워커가 30초마다 last_seen 을 갱신한다. 웹은 최근 90초 내 신호가 있으면
-- "워커 연결됨"으로 표시 → 셀러가 워커를 끄고 버튼 누르는 헛클릭 방지.
-- ============================================================

CREATE TABLE IF NOT EXISTS megaload_worker_heartbeats (
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  hostname TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (megaload_user_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_hb_user_seen
  ON megaload_worker_heartbeats(megaload_user_id, last_seen);

ALTER TABLE megaload_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_hb_select_own ON megaload_worker_heartbeats;
CREATE POLICY worker_hb_select_own ON megaload_worker_heartbeats FOR SELECT
  TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

GRANT SELECT ON megaload_worker_heartbeats TO authenticated;

-- 워커(사용자 JWT)가 본인 megaload_user_id 로만 하트비트 upsert.
CREATE OR REPLACE FUNCTION worker_heartbeat(
  p_worker_id TEXT,
  p_hostname TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_mid UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT id INTO v_mid FROM megaload_users WHERE profile_id = v_uid LIMIT 1;
  IF v_mid IS NULL THEN RETURN; END IF;

  INSERT INTO megaload_worker_heartbeats (megaload_user_id, worker_id, hostname, last_seen)
  VALUES (v_mid, p_worker_id, p_hostname, NOW())
  ON CONFLICT (megaload_user_id, worker_id)
    DO UPDATE SET last_seen = NOW(), hostname = EXCLUDED.hostname;
END;
$$;

REVOKE ALL ON FUNCTION worker_heartbeat(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION worker_heartbeat(TEXT, TEXT) TO authenticated;

-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 위 SQL 실행
