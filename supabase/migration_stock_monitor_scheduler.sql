-- ========================================================
-- 품절동기화 무차단 재설계 P1 — next_check_at 티어 스케줄러
-- sh_stock_monitors 확장
--
-- 목적: "due 인 것만" 배포하는 스케줄러로 전환.
--   기존 select 는 source_status∈(오류,error)/consecutive_errors≥1 를 즉시 재조회 대상으로 삼아
--   429 로 error 된 상품을 매 tick 계속 조회 → IP 과열 → 429 증폭. 이를 뿌리째 제거한다.
--   이제 results 라우트가 상태 티어별로 next_check_at(미래)을 배정하고,
--   monitors 라우트는 next_check_at <= now 인 것만 배포한다.
-- ========================================================

-- 1) 다음 조회 예정 시각 (NULL = 신규·최초확인 → 즉시 due)
ALTER TABLE sh_stock_monitors
  ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ;

-- 2) due-only 스케줄러 쿼리용 인덱스 (megaload_user_id + next_check_at, 활성만)
CREATE INDEX IF NOT EXISTS idx_stock_monitors_next_check
  ON sh_stock_monitors(megaload_user_id, next_check_at)
  WHERE is_active = true;

-- 3) 백필 — 기존 전량을 향후 6시간에 무작위 분산(썬더링 herd 방지).
--    한 번도 조회 안 된 것(last_checked_at IS NULL)은 즉시 due 로 둔다(신규 확인 지연 방지).
--    이렇게 하면 배포 직후 전량이 한꺼번에 due 가 되어 IP 를 때리는 사고를 막고,
--    각 상품은 이후 results 라우트가 상태 티어로 정식 재배정한다.
UPDATE sh_stock_monitors
  SET next_check_at = CASE
    WHEN last_checked_at IS NULL THEN now()
    ELSE now() + (random() * interval '6 hours')
  END
  WHERE next_check_at IS NULL;
