-- 긴급 대응 시스템: 브랜드 블랙리스트 + 인시던트 이력
-- =================================================

-- 브랜드 블랙리스트 (전체 파트너 공유)
CREATE TABLE brand_blacklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name TEXT NOT NULL,
  brand_name_en TEXT,
  category TEXT,
  risk_level TEXT NOT NULL DEFAULT 'warning'
    CHECK (risk_level IN ('low','warning','high','critical')),
  complaint_type TEXT NOT NULL
    CHECK (complaint_type IN ('trademark','copyright','authentic_cert','parallel_import','price_policy','other')),
  description TEXT,
  reported_count INTEGER DEFAULT 1,
  added_by UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인시던트 이력 (파트너별)
CREATE TABLE incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id),
  incident_type TEXT NOT NULL CHECK (incident_type IN ('brand_complaint','account_penalty')),
  sub_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','in_progress','resolved','escalated','closed')),
  title TEXT NOT NULL,
  description TEXT,
  brand_name TEXT,
  product_name TEXT,
  coupang_reference TEXT,
  actions_taken TEXT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  admin_note TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE brand_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- brand_blacklist: 인증 사용자 읽기 가능
CREATE POLICY "brand_blacklist_select" ON brand_blacklist
  FOR SELECT TO authenticated USING (true);

-- brand_blacklist: 관리자만 CUD
CREATE POLICY "brand_blacklist_admin_insert" ON brand_blacklist
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "brand_blacklist_admin_update" ON brand_blacklist
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "brand_blacklist_admin_delete" ON brand_blacklist
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- incidents: 본인 것만 읽기 가능
CREATE POLICY "incidents_select_own" ON incidents
  FOR SELECT TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- incidents: 본인만 insert
CREATE POLICY "incidents_insert_own" ON incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

-- incidents: 본인 + 관리자 update
CREATE POLICY "incidents_update" ON incidents
  FOR UPDATE TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 인덱스
CREATE INDEX idx_brand_blacklist_brand ON brand_blacklist(brand_name);
CREATE INDEX idx_brand_blacklist_active ON brand_blacklist(is_active);
CREATE INDEX idx_incidents_pt_user ON incidents(pt_user_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_type ON incidents(incident_type);
