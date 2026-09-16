-- ============================================================
-- AI 상담 레이트 리밋
--
-- /api/assistant/chat 은 비로그인도 호출할 수 있다(공개 랜딩에서 상담이 돼야 하므로).
-- 제한이 없으면 LLM 토큰 비용과 DB 쓰기가 무방비로 노출된다.
-- 사용자 1만 명 규모에서는 정상 사용량만으로도 상한이 필요하다.
--
-- 설계
--  - subject: 'p:<profile_id>' (로그인) 또는 'i:<ip>' (비로그인)
--    anon_key 는 클라이언트가 만드는 값이라 얼마든지 새로 만들 수 있어 제한 키로 못 쓴다.
--  - 분 단위 창(버스트)과 일 단위 창(비용)을 같이 본다.
--  - 원자적 증가가 필요하므로 RPC 한 번으로 "증가 + 허용여부 판정"을 끝낸다.
-- ============================================================

CREATE TABLE IF NOT EXISTS assistant_rate_limits (
  subject TEXT NOT NULL,
  -- 창의 시작 시각. 분 창이면 분 단위로, 일 창이면 일 단위로 절삭해 넣는다.
  window_start TIMESTAMPTZ NOT NULL,
  -- 'm' = 분, 'd' = 일
  window_kind TEXT NOT NULL CHECK (window_kind IN ('m', 'd')),
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, window_kind, window_start)
);

-- 오래된 창 정리를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_assistant_rate_window
  ON assistant_rate_limits(window_start);

ALTER TABLE assistant_rate_limits ENABLE ROW LEVEL SECURITY;
-- 서버(service role)만 만진다. 클라이언트 직접 접근은 정책이 없으므로 전부 차단된다.

/**
 * 호출 1회를 기록하고 허용 여부를 돌려준다.
 *
 * 반환: (allowed, retry_after_seconds, minute_count, day_count)
 * 한도를 넘으면 카운트를 올리지 않는다 — 막힌 요청이 다음 창까지 밀어내면 안 되므로.
 */
CREATE OR REPLACE FUNCTION assistant_rate_bump(
  p_subject TEXT,
  p_minute_limit INT,
  p_day_limit INT
)
RETURNS TABLE (allowed BOOLEAN, retry_after INT, minute_count INT, day_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_start TIMESTAMPTZ := date_trunc('minute', now());
  v_day_start TIMESTAMPTZ := date_trunc('day', now());
  v_min INT;
  v_day INT;
BEGIN
  SELECT COALESCE(count, 0) INTO v_min
    FROM assistant_rate_limits
   WHERE subject = p_subject AND window_kind = 'm' AND window_start = v_min_start;
  SELECT COALESCE(count, 0) INTO v_day
    FROM assistant_rate_limits
   WHERE subject = p_subject AND window_kind = 'd' AND window_start = v_day_start;

  v_min := COALESCE(v_min, 0);
  v_day := COALESCE(v_day, 0);

  IF v_min >= p_minute_limit THEN
    RETURN QUERY SELECT
      false,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_min_start + INTERVAL '1 minute') - now()))::INT),
      v_min, v_day;
    RETURN;
  END IF;

  IF v_day >= p_day_limit THEN
    RETURN QUERY SELECT
      false,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_day_start + INTERVAL '1 day') - now()))::INT),
      v_min, v_day;
    RETURN;
  END IF;

  INSERT INTO assistant_rate_limits (subject, window_kind, window_start, count)
  VALUES (p_subject, 'm', v_min_start, 1)
  ON CONFLICT (subject, window_kind, window_start)
  DO UPDATE SET count = assistant_rate_limits.count + 1
  RETURNING count INTO v_min;

  INSERT INTO assistant_rate_limits (subject, window_kind, window_start, count)
  VALUES (p_subject, 'd', v_day_start, 1)
  ON CONFLICT (subject, window_kind, window_start)
  DO UPDATE SET count = assistant_rate_limits.count + 1
  RETURNING count INTO v_day;

  RETURN QUERY SELECT true, 0, v_min, v_day;
END;
$$;

/** 이틀 지난 창은 지운다. 크론이 없어도 테이블이 무한히 자라지 않게 호출 시 가끔 청소한다. */
CREATE OR REPLACE FUNCTION assistant_rate_gc()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM assistant_rate_limits WHERE window_start < now() - INTERVAL '2 days';
$$;
