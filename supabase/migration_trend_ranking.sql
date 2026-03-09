-- 트렌드 키워드 랭킹 시스템 확장
-- 상품수, 경쟁강도, 일간/주간 순위, 수집 시각 컬럼 추가

ALTER TABLE trending_keywords
  ADD COLUMN IF NOT EXISTS product_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS competition_ratio NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_daily INTEGER,
  ADD COLUMN IF NOT EXISTS rank_weekly INTEGER,
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- 키워드+카테고리 유니크 인덱스 (upsert용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_kw_category
  ON trending_keywords (keyword, category);
