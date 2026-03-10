-- ============================================================
-- 1. 긴급 대응 시스템 테이블 생성 (incidents + brand_blacklist)
-- ============================================================

CREATE TABLE IF NOT EXISTS brand_blacklist (
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

CREATE TABLE IF NOT EXISTS incidents (
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

-- RLS
ALTER TABLE brand_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_blacklist_select" ON brand_blacklist
  FOR SELECT TO authenticated USING (true);

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

CREATE POLICY "incidents_select_own" ON incidents
  FOR SELECT TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "incidents_insert_own" ON incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "incidents_update" ON incidents
  FOR UPDATE TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_brand_blacklist_brand ON brand_blacklist(brand_name);
CREATE INDEX IF NOT EXISTS idx_brand_blacklist_active ON brand_blacklist(is_active);
CREATE INDEX IF NOT EXISTS idx_incidents_pt_user ON incidents(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(incident_type);


-- ============================================================
-- 2. penalty_records CHECK 제약 조건 업데이트 (11개 카테고리)
-- ============================================================

-- 기존 CHECK 제약 조건 제거 후 새 제약 조건 추가
ALTER TABLE penalty_records DROP CONSTRAINT IF EXISTS penalty_records_penalty_category_check;

ALTER TABLE penalty_records ADD CONSTRAINT penalty_records_penalty_category_check
  CHECK (penalty_category IN (
    'trademark_infringement',
    'copyright_infringement',
    'authenticity_request',
    'parallel_import',
    'price_policy_violation',
    'delivery_delay',
    'cs_nonresponse',
    'false_advertising',
    'product_info_mismatch',
    'account_suspension',
    'account_permanent_ban',
    'return_rate_excess'
  ));
