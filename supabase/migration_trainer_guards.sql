-- ============================================
-- 추천(트레이너) 커미션 가드 — 12개월 한정 · 환수(클로백)
--
-- 지급 기준은 변경 없음: 순이익 × bonus_percentage(기본 5%). 월 상한은 두지 않는다.
-- 여기서 추가하는 건 "언제까지 / 되돌릴 수 있는가" 2가지.
-- ============================================

-- 1. trainer_trainees — 지급 기간 12개월 한정
--    첫 보너스가 지급된 달(bonus_first_year_month)을 앵커로,
--    마지막 지급 가능 월(bonus_until_year_month, 포함)까지만 지급.
--    'YYYY-MM' 문자열 비교로 판정 → 정산이 늦게 처리돼도 결과가 흔들리지 않음.
ALTER TABLE trainer_trainees ADD COLUMN IF NOT EXISTS bonus_first_year_month VARCHAR(7);
ALTER TABLE trainer_trainees ADD COLUMN IF NOT EXISTS bonus_until_year_month VARCHAR(7);

-- 2. trainer_earnings — 환수 추적
ALTER TABLE trainer_earnings ADD COLUMN IF NOT EXISTS clawed_back_at TIMESTAMPTZ;
ALTER TABLE trainer_earnings ADD COLUMN IF NOT EXISTS clawback_reason VARCHAR(200);

-- 3. 기존 링크 backfill —
--    이미 보너스가 나간 적 있는 추천 관계는 "배포 시점"이 아니라
--    "실제 첫 보너스 달"을 기준으로 12개월을 계산해야 소급 이득/손해가 없다.
UPDATE trainer_trainees tt
SET bonus_first_year_month = sub.first_ym,
    bonus_until_year_month = to_char(
      (to_date(sub.first_ym, 'YYYY-MM') + INTERVAL '11 months'), 'YYYY-MM'
    )
FROM (
  SELECT trainee_pt_user_id, MIN(year_month) AS first_ym
  FROM trainer_earnings
  GROUP BY trainee_pt_user_id
) sub
WHERE tt.trainee_pt_user_id = sub.trainee_pt_user_id
  AND tt.bonus_first_year_month IS NULL;

-- 4. 인덱스 — 환수 필터가 집계 쿼리마다 붙는다
CREATE INDEX IF NOT EXISTS idx_trainer_earnings_clawed_back
  ON trainer_earnings(clawed_back_at);
CREATE INDEX IF NOT EXISTS idx_trainer_trainees_trainee
  ON trainer_trainees(trainee_pt_user_id);
