-- 트렌드 키워드 테이블
CREATE TABLE trending_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '기타',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'naver')),
  trend_score INTEGER NOT NULL DEFAULT 50 CHECK (trend_score BETWEEN 0 AND 100),
  naver_category_id TEXT,
  naver_trend_data JSONB,
  naver_fetched_at TIMESTAMPTZ,
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_trending_keywords_active ON trending_keywords (is_active, trend_score DESC);
CREATE INDEX idx_trending_keywords_category ON trending_keywords (category) WHERE is_active = true;

-- RLS
ALTER TABLE trending_keywords ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 조회 가능
CREATE POLICY "trending_keywords_select" ON trending_keywords
  FOR SELECT TO authenticated USING (true);

-- 관리자만 CUD
CREATE POLICY "trending_keywords_admin_insert" ON trending_keywords
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trending_keywords_admin_update" ON trending_keywords
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "trending_keywords_admin_delete" ON trending_keywords
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
