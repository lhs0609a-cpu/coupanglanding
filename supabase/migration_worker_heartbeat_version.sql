-- ============================================================
-- 도우미 하트비트에 앱 버전 싣기
-- ------------------------------------------------------------
-- 기존 하트비트는 worker_id·hostname 만 보내서, 서버는 "연결됨"만 알 뿐
-- 접속한 도우미가 몇 버전인지 몰랐다. 그래서 웹은 "최신 vX"라고 안내만 할 뿐
-- 정작 그 사용자가 구버전을 쓰는지 알 수 없었다.
-- 버전을 함께 받으면 웹이 "연결됨 · v0.2.34 (최신 v0.2.40) 업데이트 필요"를
-- 실제 근거로 띄울 수 있다.
--
-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 이 파일 전체 실행
-- ============================================================

ALTER TABLE megaload_worker_heartbeats
  ADD COLUMN IF NOT EXISTS app_version TEXT;

-- ⚠️ 파라미터 추가는 CREATE OR REPLACE 로 안 된다(시그니처가 달라 새 오버로드가 생기고,
--    2인자 호출이 모호해져 실패한다). 옛 2인자 함수를 먼저 지운다.
DROP FUNCTION IF EXISTS worker_heartbeat(TEXT, TEXT);

-- 워커(사용자 JWT)가 본인 megaload_user_id 로만 하트비트 upsert.
-- p_app_version 은 DEFAULT NULL — 이미 설치된 구버전 도우미는 2인자로 호출하는데,
-- 그 호출도 이 함수로 그대로 해석된다(app_version 만 NULL). 즉 하위호환 유지.
CREATE OR REPLACE FUNCTION worker_heartbeat(
  p_worker_id TEXT,
  p_hostname TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL
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

  INSERT INTO megaload_worker_heartbeats (megaload_user_id, worker_id, hostname, last_seen, app_version)
  VALUES (v_mid, p_worker_id, p_hostname, NOW(), p_app_version)
  ON CONFLICT (megaload_user_id, worker_id)
    DO UPDATE SET
      last_seen = NOW(),
      hostname = EXCLUDED.hostname,
      -- 구버전이 NULL 을 보내도 마지막으로 알던 버전을 지우지 않는다.
      app_version = COALESCE(EXCLUDED.app_version, megaload_worker_heartbeats.app_version);
END;
$$;

REVOKE ALL ON FUNCTION worker_heartbeat(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION worker_heartbeat(TEXT, TEXT, TEXT) TO authenticated;
