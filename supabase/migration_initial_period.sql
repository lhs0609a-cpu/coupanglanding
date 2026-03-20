-- 첫 정산 합산 구간: period_start / period_end 컬럼 추가
-- NULL = 기존 표준 캘린더 월 (하위 호환)
ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;
