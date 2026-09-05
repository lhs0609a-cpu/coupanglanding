-- ============================================================
-- 하트비트에 도우미의 로컬 엔드포인트(포트·nonce) 싣기
-- ------------------------------------------------------------
-- 왜: 웹 올인원 등록 화면이 폴더를 다시 고르지 않고, 도우미가 방금 생성한 결과
--     (_allinone.generated.jsonl)와 이미지를 localhost 에서 직접 읽게 하기 위함.
--     파일이 이미 같은 PC 에 있으므로 Storage 에 올렸다 도로 받는 건 낭비다
--     (등록도 안 할 상품 이미지까지 올라가고 7일간 스토리지를 먹는다).
--
--     도우미의 pair-server 는 매 실행마다 랜덤 포트 + nonce 를 쓴다. 웹이 그걸 알 방법이
--     없어서, 이미 30초마다 도는 하트비트에 실어 보낸다 → 웹은 worker-status 로 발견.
--
-- 보안: nonce 는 그 PC 의 localhost 에 접근 가능한 주체에게만 의미가 있는 능력 토큰이고,
--       RLS 상 본인 하트비트만 읽을 수 있다. pair-server 는 CORS 도 메가로드 오리진으로 제한.
--
-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 이 파일 전체 실행
-- ============================================================

-- {port:int, nonce:text} — 컬럼 2개 대신 JSONB 하나로(함수 인자 폭증 방지).
ALTER TABLE megaload_worker_heartbeats
  ADD COLUMN IF NOT EXISTS local_endpoint JSONB;

-- ⚠️ 인자 추가는 CREATE OR REPLACE 로 안 된다(새 오버로드가 생겨 기존 호출이 모호해짐).
--    직전 버전(3인자)을 먼저 지운다. migration_worker_heartbeat_version.sql 이 선행되어야 함.
DROP FUNCTION IF EXISTS worker_heartbeat(TEXT, TEXT, TEXT);

-- 구버전 도우미는 2·3인자로 호출하는데 DEFAULT 라 그 호출도 이 함수로 해석된다(하위호환).
CREATE OR REPLACE FUNCTION worker_heartbeat(
  p_worker_id TEXT,
  p_hostname TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_local_endpoint JSONB DEFAULT NULL
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

  INSERT INTO megaload_worker_heartbeats
    (megaload_user_id, worker_id, hostname, last_seen, app_version, local_endpoint)
  VALUES (v_mid, p_worker_id, p_hostname, NOW(), p_app_version, p_local_endpoint)
  ON CONFLICT (megaload_user_id, worker_id)
    DO UPDATE SET
      last_seen = NOW(),
      hostname = EXCLUDED.hostname,
      -- 구버전이 NULL 을 보내도 마지막으로 알던 값을 지우지 않는다.
      app_version = COALESCE(EXCLUDED.app_version, megaload_worker_heartbeats.app_version),
      local_endpoint = COALESCE(EXCLUDED.local_endpoint, megaload_worker_heartbeats.local_endpoint);
END;
$$;

REVOKE ALL ON FUNCTION worker_heartbeat(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION worker_heartbeat(TEXT, TEXT, TEXT, JSONB) TO authenticated;
