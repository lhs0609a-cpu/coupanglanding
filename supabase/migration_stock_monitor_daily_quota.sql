-- ========================================================
-- 품절 모니터링 — 유저별 하루 할당량
--
-- 배경: 공정 배분(라운드로빈)만으로는 "한 유저가 하루에 얼마나 가져가는지" 상한이 없다.
--   실행당 상한(p_limit_per_user)은 있지만 48회를 곱하면 최대 576건까지 열려 있어,
--   본사가 감당할 총량을 유저 수로 예측하기 어렵다.
--
-- 더 중요한 이유 — 실측(2026-08-10):
--   자기 도우미가 정상 동작하는 유저(89d59e5e, 실패율 6%)는 자체적으로 하루 1만 건 넘게
--   확인한다. 그런 유저까지 서버 예산을 쓰면 정작 도우미가 없거나 차단된 유저의 몫이 준다.
--   할당량은 "이미 충분히 확인된 유저"를 자연스럽게 큐에서 빼주는 역할도 한다.
--
-- 집계는 **롤링 24시간**이다(달력 하루가 아니라).
--   자정 리셋 방식은 0시에 전 유저가 한꺼번에 되살아나 썬더링 herd 를 만든다.
--   롤링이면 소진과 회복이 부드럽게 분산된다.
--
-- 집계 대상은 경로를 가리지 않는다(서버·도우미 모두 포함). "이 유저 상품이 최근 24시간
-- 안에 몇 개나 확인됐나"가 기준이어야 도우미가 일하는 만큼 서버가 덜 일하게 된다.
-- ========================================================

-- 인자 개수가 바뀌면 CREATE OR REPLACE 는 교체가 아니라 오버로드를 만든다(호출 모호성 유발).
-- 그래서 기존 버전을 명시적으로 지운다.
DROP FUNCTION IF EXISTS pick_due_stock_monitors(INT, INT);
DROP FUNCTION IF EXISTS pick_due_stock_monitors(INT, INT, INT);

CREATE FUNCTION pick_due_stock_monitors(
  p_limit_per_user INT DEFAULT 12,
  p_total INT DEFAULT 200,
  -- 0 이하면 할당량 없음(기존 동작 유지)
  p_daily_quota INT DEFAULT 0
)
RETURNS SETOF sh_stock_monitors
LANGUAGE sql
STABLE
AS $$
  WITH served AS (
    -- 최근 24시간 동안 이 유저 상품이 몇 개나 확인됐나(경로 무관)
    SELECT megaload_user_id, COUNT(*)::INT AS n
    FROM sh_stock_monitors
    WHERE is_active = true
      AND last_checked_at >= now() - INTERVAL '24 hours'
    GROUP BY megaload_user_id
  ),
  eligible AS (
    SELECT m.id, m.megaload_user_id, m.last_checked_at
    FROM sh_stock_monitors m
    LEFT JOIN served s ON s.megaload_user_id = m.megaload_user_id
    WHERE m.is_active = true
      AND m.source_url IS NOT NULL
      AND m.source_url <> ''
      AND m.consecutive_errors < 10
      AND (m.next_check_at IS NULL OR m.next_check_at <= now())
      AND (p_daily_quota <= 0 OR COALESCE(s.n, 0) < p_daily_quota)
  ),
  ranked AS (
    SELECT id,
           last_checked_at,
           ROW_NUMBER() OVER (
             PARTITION BY megaload_user_id
             -- 오래 방치된 것부터. 한 번도 확인 안 된 건(NULL) 최우선.
             ORDER BY last_checked_at ASC NULLS FIRST
           ) AS rn
    FROM eligible
  ),
  picked AS (
    SELECT r.id, r.rn, r.last_checked_at
    FROM ranked r
    WHERE r.rn <= p_limit_per_user
    -- rn 우선 = 유저별 라운드로빈. 같은 rn 안에서는 더 오래 방치된 쪽 먼저.
    ORDER BY r.rn ASC, r.last_checked_at ASC NULLS FIRST
    LIMIT p_total
  )
  SELECT m.*
  FROM sh_stock_monitors m
  JOIN picked p ON p.id = m.id
  ORDER BY p.rn ASC, p.last_checked_at ASC NULLS FIRST;
$$;

-- 24시간 집계를 받쳐주는 인덱스
CREATE INDEX IF NOT EXISTS idx_stock_monitors_served_24h
  ON sh_stock_monitors(last_checked_at)
  WHERE is_active = true;
