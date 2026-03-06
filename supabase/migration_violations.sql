-- =============================================
-- Partner Violations (계약위반 관리) Migration
-- =============================================

-- 1. partner_violations 테이블
CREATE TABLE partner_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id),

  -- violation classification
  violation_category TEXT NOT NULL CHECK (violation_category IN (
    'settlement', 'access_rights', 'confidentiality', 'operation', 'other'
  )),
  violation_type TEXT NOT NULL CHECK (violation_type IN (
    'non_payment_3months', 'false_revenue_report', 'access_sharing',
    'credential_update_delay', 'confidentiality_breach', 'competing_service',
    'product_deactivation_fail', 'blacklist_brand_sale',
    'seller_account_terminated', 'other'
  )),

  -- status workflow
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN (
    'reported', 'investigating', 'dismissed', 'action_taken', 'resolved', 'escalated', 'terminated'
  )),

  -- action level
  action_level TEXT CHECK (action_level IN (
    'notice', 'warning', 'corrective', 'termination'
  )),

  -- details
  title TEXT NOT NULL,
  description TEXT,
  evidence TEXT,
  contract_article TEXT,

  -- partner response
  partner_response TEXT,
  partner_responded_at TIMESTAMPTZ,

  -- correction
  correction_deadline TIMESTAMPTZ,
  correction_completed_at TIMESTAMPTZ,

  -- admin notes
  admin_notes TEXT,

  -- related incident
  related_incident_id UUID REFERENCES incidents(id),

  -- audit trail
  reported_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. violation_history 테이블
CREATE TABLE violation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id UUID NOT NULL REFERENCES partner_violations(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_action_level TEXT,
  new_action_level TEXT,
  changed_by UUID REFERENCES profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. violation_summary 테이블
CREATE TABLE violation_summary (
  pt_user_id UUID PRIMARY KEY REFERENCES pt_users(id),
  total_violations INT DEFAULT 0,
  active_violations INT DEFAULT 0,
  notice_count INT DEFAULT 0,
  warning_count INT DEFAULT 0,
  corrective_count INT DEFAULT 0,
  last_violation_at TIMESTAMPTZ,
  risk_score INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_violations_pt_user ON partner_violations(pt_user_id);
CREATE INDEX idx_violations_status ON partner_violations(status);
CREATE INDEX idx_violations_category ON partner_violations(violation_category);
CREATE INDEX idx_violations_created ON partner_violations(created_at DESC);
CREATE INDEX idx_violation_history_vid ON violation_history(violation_id);

-- RLS Policies
ALTER TABLE partner_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_summary ENABLE ROW LEVEL SECURITY;

-- partner_violations: admins see all, partners see own
CREATE POLICY "Admins can manage all violations"
  ON partner_violations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Partners can view own violations"
  ON partner_violations FOR SELECT
  TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "Partners can update own violations for response"
  ON partner_violations FOR UPDATE
  TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

-- violation_history: admins see all, partners see own
CREATE POLICY "Admins can manage violation history"
  ON violation_history FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Partners can view own violation history"
  ON violation_history FOR SELECT
  TO authenticated
  USING (
    violation_id IN (
      SELECT id FROM partner_violations
      WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    )
  );

-- violation_summary: admins see all, partners see own
CREATE POLICY "Admins can manage violation summary"
  ON violation_summary FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Partners can view own violation summary"
  ON violation_summary FOR SELECT
  TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );
