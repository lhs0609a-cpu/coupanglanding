-- ============================================================
-- cron_locks: pool-safe TTL 기반 cron 동시 실행 차단
-- ------------------------------------------------------------
-- 기존 payment_try_advisory_lock(BIGINT) / payment_advisory_unlock(BIGINT) 은
-- pg_(try_)advisory_lock 을 사용하는데 이 락은 "세션 스코프"여서
-- Supabase PostgREST/supavisor 풀이 lock 획득 커넥션과 unlock 커넥션을
-- 다르게 잡아 줄 수 있다. 그러면 unlock RPC 가 실제 락을 보유하지 않은
-- 다른 세션에서 호출되어 무효 처리되고, 원래 세션의 락이 영구 잔존한다.
-- → 다음 cron 호출이 항상 409. 실제 결제 cron 이 멈춰버린다.
--
-- 해결: 락을 "행"으로 표현하고 INSERT ... ON CONFLICT DO UPDATE WHERE 로
-- atomic 하게 잡는다. 풀과 무관하고, TTL 이 지나면 자연 회복된다.
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_locks (
  lock_key TEXT PRIMARY KEY,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acquired_by TEXT
);

-- p_ttl_seconds: 락을 stale 로 간주하고 강탈 가능한 시점.
-- cron 작업의 최대 실행 시간보다 길게 잡아야 한다. 기본 30분.
CREATE OR REPLACE FUNCTION cron_try_acquire_lock(
  p_key TEXT,
  p_ttl_seconds INTEGER DEFAULT 1800,
  p_acquired_by TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_threshold TIMESTAMPTZ := NOW() - (p_ttl_seconds || ' seconds')::INTERVAL;
  v_inserted_or_refreshed BOOLEAN;
BEGIN
  -- 존재하지 않거나 TTL 지난 락만 강탈. WHERE 미충족이면 conflict 무시(=락 못 잡음).
  WITH upsert AS (
    INSERT INTO cron_locks (lock_key, acquired_at, acquired_by)
    VALUES (p_key, NOW(), p_acquired_by)
    ON CONFLICT (lock_key) DO UPDATE
      SET acquired_at = EXCLUDED.acquired_at,
          acquired_by = EXCLUDED.acquired_by
      WHERE cron_locks.acquired_at < v_threshold
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM upsert) INTO v_inserted_or_refreshed;

  RETURN v_inserted_or_refreshed;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cron_release_lock(p_key TEXT) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM cron_locks WHERE lock_key = p_key;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION cron_try_acquire_lock(TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION cron_release_lock(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cron_try_acquire_lock(TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cron_release_lock(TEXT) TO service_role;

ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;
-- service_role bypass RLS 이므로 정책 별도로 두지 않음.
