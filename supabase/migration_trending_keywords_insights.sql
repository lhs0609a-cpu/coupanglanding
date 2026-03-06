-- 트렌드 키워드 소싱 인사이트 컬럼 추가
-- 리셀러 실전 활용을 위한 상세 분석 데이터

ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS sourcing_tip TEXT;
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS keyword_tip TEXT;
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS seasonality TEXT DEFAULT '연중';
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS margin_range TEXT;
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium';
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS pros JSONB DEFAULT '[]';
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS cons JSONB DEFAULT '[]';
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS recommended_price_min INTEGER;
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS recommended_price_max INTEGER;
ALTER TABLE trending_keywords ADD COLUMN IF NOT EXISTS related_keywords JSONB DEFAULT '[]';
