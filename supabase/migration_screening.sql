-- 파트너 스크리닝 시스템 테이블

-- ─── screening_links ───
CREATE TABLE IF NOT EXISTS screening_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token UUID NOT NULL UNIQUE,
  candidate_name TEXT NOT NULL,
  candidate_phone TEXT,
  candidate_memo TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── screening_results ───
CREATE TABLE IF NOT EXISTS screening_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID NOT NULL UNIQUE REFERENCES screening_links(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  total_score NUMERIC(5,1) NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'D' CHECK (grade IN ('S', 'A', 'B', 'C', 'D')),
  category_scores JSONB NOT NULL DEFAULT '[]',
  red_flags JSONB NOT NULL DEFAULT '[]',
  yellow_flags JSONB NOT NULL DEFAULT '[]',
  green_flags JSONB NOT NULL DEFAULT '[]',
  consistency_warnings JSONB NOT NULL DEFAULT '[]',
  knockout_reasons JSONB NOT NULL DEFAULT '[]',
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  admin_decision TEXT NOT NULL DEFAULT 'pending' CHECK (admin_decision IN ('approved', 'pending', 'rejected', 'hold')),
  admin_memo TEXT,
  respondent_ip TEXT,
  free_text_answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 인덱스 ───
CREATE INDEX IF NOT EXISTS idx_screening_links_token ON screening_links(token);
CREATE INDEX IF NOT EXISTS idx_screening_links_status ON screening_links(status);
CREATE INDEX IF NOT EXISTS idx_screening_results_link_id ON screening_results(link_id);
CREATE INDEX IF NOT EXISTS idx_screening_results_grade ON screening_results(grade);

-- ─── updated_at 트리거 ───
CREATE OR REPLACE TRIGGER update_screening_links_updated_at
  BEFORE UPDATE ON screening_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER update_screening_results_updated_at
  BEFORE UPDATE ON screening_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── RLS ───
ALTER TABLE screening_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근 (공개 API는 createServiceClient 사용)
CREATE POLICY "Admin full access on screening_links"
  ON screening_links
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admin full access on screening_results"
  ON screening_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
