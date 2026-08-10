-- ========================================================
-- 품절 모니터링 용량 재배분 — 에러 지수 백오프 + 정합성 reconcile 인덱스
--
-- 배경(2026-08-10 프로덕션 실측):
--   활성 모니터 18,605건 / 전 경로 합계 처리량 약 8,500건/일.
--   그런데 티어 설계가 요구하는 양은 약 60,000건/일 — 실제 용량의 7배라 큐가 상시 밀린다.
--   밀린 큐에서는 가장 짧은 주기를 받은 쪽이 먼저 due 가 되므로, error(1.5h)/unknown(2h) 이
--   용량의 67% 를 가져가고 정상 상품(in_stock)은 27%, 재입고 감시가 필요한 sold_out 은 1%
--   (390건에 하루 64회 = 6일 주기)만 받았다.
--
--   근본 원인은 error 티어가 "고정 1.5시간"이라 영구 실패 상품이 영원히 최우선이라는 점.
--   results 라우트가 transient/infra 에러는 consecutive_errors 를 올리지 않으므로
--   (오탐 누적 방지) 실패가 몇 번째인지 셀 수단이 아예 없었다 — 실측상 6,280건 전부 0.
--   → 조회 스케줄 전용 백오프 카운터를 따로 둔다.
-- ========================================================

-- 1) 조회 스케줄 백오프 단계 (0=정상, 1..5=실패 누적 → 재조회 간격 지수 증가)
--    consecutive_errors 와 분리한 이유: 저쪽은 "쿠팡 토글을 멈출 만큼 심각한가"를 재는
--    별개 신호(cron 이 <10 으로 필터)라, 조회 주기 계산에 섞으면 두 정책이 서로를 망친다.
ALTER TABLE sh_stock_monitors
  ADD COLUMN IF NOT EXISTS check_backoff_level SMALLINT NOT NULL DEFAULT 0;

-- 2) 정합성 불일치(reconcile) 전용 부분 인덱스
--    쿠팡 토글 크론이 "원본과 쿠팡이 어긋난 것"만 훑을 때 쓴다. 부분 인덱스라 크기가 작다.
CREATE INDEX IF NOT EXISTS idx_stock_monitors_mismatch
  ON sh_stock_monitors(megaload_user_id, last_checked_at)
  WHERE is_active = true
    AND (
      (source_status IN ('sold_out', 'removed') AND coupang_status = 'active')
      OR (source_status = 'in_stock' AND coupang_status = 'suspended')
    );

-- 3) 백필 — 이미 실패 중인 건을 큐에서 내려 정상 상품에 용량을 돌려준다.
--    error → 2단계(24h), unknown → 1단계(6h). 다음 조회가 성공하면 results 라우트가
--    즉시 0 으로 리셋하므로, 잘못 내려간 건의 최대 손해는 "한 번 더 기다림"뿐이다.
UPDATE sh_stock_monitors
  SET check_backoff_level = CASE
    WHEN source_status = 'error' THEN 2
    ELSE 1
  END
  WHERE is_active = true
    AND source_status IN ('error', 'unknown')
    AND check_backoff_level = 0;

-- 4) 백필된 건의 next_check_at 재배정 — 썬더링 herd 방지용 무작위 분산.
--    지금 전량이 due 로 몰려 있어(실측 연체 83%) 그대로 두면 백오프가 의미를 잃는다.
UPDATE sh_stock_monitors
  SET next_check_at = now() + (random() * (check_backoff_level * interval '12 hours'))
  WHERE is_active = true
    AND check_backoff_level > 0;

-- ========================================================
-- 5) 공정 배분 스케줄러 — 유저별 라운드로빈으로 due 모니터를 뽑는다.
--
-- 왜 필요한가: 조회 용량(하루 약 12,000건)이 수요(18,605건)보다 적다. 단순히
--   "오래된 순 전역 정렬"로 뽑으면 모니터를 많이 가진 유저가 큐를 독식한다.
--   실측 편차가 크다 — 한 유저가 3,631개인데 다른 유저는 1개다. 이러면 작은 유저는
--   자기 상품이 영영 확인되지 않고, 큰 유저도 어차피 다 못 돈다(둘 다 손해).
--
-- 어떻게: 유저 안에서 "가장 오래 방치된 것"부터 번호(rn)를 매기고, **rn 순으로** 정렬한다.
--   → 전 유저의 1순위 → 전 유저의 2순위 → ... 순서가 되어 자연스럽게 라운드로빈이 된다.
--   p_total 로 자르면 공평하게 잘린다. 상품이 적은 유저는 일찍 소진되고, 남은 용량은
--   자동으로 큰 유저에게 흘러간다(spillover) — 고정 쿼터처럼 용량을 놀리지 않는다.
--
--   p_limit_per_user : 한 번 실행에서 유저당 최대 몇 개까지 (공정성 상한)
--   p_total          : 한 번 실행 총량 (본사가 감당할 수준 = 비용 상한)
--   유저가 늘면 p_total 은 그대로 두고 1인당 몫만 자연히 줄어든다.
-- ========================================================
CREATE OR REPLACE FUNCTION pick_due_stock_monitors(
  p_limit_per_user INT DEFAULT 15,
  p_total INT DEFAULT 250
)
RETURNS SETOF sh_stock_monitors
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    -- id 와 정렬키만 랭킹한다. m.* 를 여기서 끌고 오면 rn 이 붙은 행을 테이블 복합타입으로
    -- 캐스팅할 수 없어(컬럼 수 불일치) 함수가 깨진다.
    SELECT m.id,
           m.last_checked_at,
           ROW_NUMBER() OVER (
             PARTITION BY m.megaload_user_id
             -- 유저 안에서는 "가장 오래 확인 안 된 것"부터. 한 번도 확인 안 된 건 최우선.
             ORDER BY m.last_checked_at ASC NULLS FIRST
           ) AS rn
    FROM sh_stock_monitors m
    WHERE m.is_active = true
      AND m.source_url IS NOT NULL
      AND m.source_url <> ''
      AND m.consecutive_errors < 10
      AND (m.next_check_at IS NULL OR m.next_check_at <= now())
  ),
  picked AS (
    SELECT r.id, r.rn, r.last_checked_at
    FROM ranked r
    WHERE r.rn <= p_limit_per_user
    -- rn 우선 정렬이 곧 라운드로빈. 같은 rn 안에서는 오래 방치된 유저를 먼저.
    ORDER BY r.rn ASC, r.last_checked_at ASC NULLS FIRST
    LIMIT p_total
  )
  SELECT m.*
  FROM sh_stock_monitors m
  JOIN picked p ON p.id = m.id
  -- 시간이 모자라 배치가 잘릴 때 가장 오래 방치된 것부터 처리되도록 순서를 유지한다.
  ORDER BY p.rn ASC, p.last_checked_at ASC NULLS FIRST;
$$;

-- 위 함수의 partition/order 를 그대로 받쳐주는 인덱스.
CREATE INDEX IF NOT EXISTS idx_stock_monitors_fairshare
  ON sh_stock_monitors(megaload_user_id, last_checked_at)
  WHERE is_active = true;
