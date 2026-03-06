-- 페널티 점수 트래커 마이그레이션

-- ============================================================
-- Table 1: penalty_records
-- ============================================================
CREATE TABLE IF NOT EXISTS penalty_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  penalty_category TEXT NOT NULL CHECK (penalty_category IN ('delivery_delay', 'cs_nonresponse', 'return_rate_excess', 'product_info_mismatch', 'false_advertising')),
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  score_impact INTEGER NOT NULL DEFAULT 10,
  evidence_url TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  reported_by TEXT NOT NULL DEFAULT 'self' CHECK (reported_by IN ('self', 'admin')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Table 2: penalty_summary (one row per user, aggregate cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS penalty_summary (
  pt_user_id UUID PRIMARY KEY REFERENCES pt_users(id) ON DELETE CASCADE,
  total_records INTEGER NOT NULL DEFAULT 0,
  active_records INTEGER NOT NULL DEFAULT 0,
  delivery_delay_count INTEGER NOT NULL DEFAULT 0,
  cs_nonresponse_count INTEGER NOT NULL DEFAULT 0,
  return_rate_excess_count INTEGER NOT NULL DEFAULT 0,
  product_info_mismatch_count INTEGER NOT NULL DEFAULT 0,
  false_advertising_count INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'safe' CHECK (risk_level IN ('safe', 'caution', 'warning', 'danger')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_penalty_records_pt_user_id ON penalty_records(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_penalty_records_penalty_category ON penalty_records(penalty_category);
CREATE INDEX IF NOT EXISTS idx_penalty_records_is_resolved ON penalty_records(is_resolved);

-- ============================================================
-- RLS: penalty_records
-- ============================================================
ALTER TABLE penalty_records ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own records
CREATE POLICY "penalty_records_select_own" ON penalty_records
  FOR SELECT
  USING (
    pt_user_id IN (
      SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid()
    )
  );

-- Admins can SELECT all records
CREATE POLICY "penalty_records_select_admin" ON penalty_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can INSERT their own records (self-report only)
CREATE POLICY "penalty_records_insert_self" ON penalty_records
  FOR INSERT
  WITH CHECK (
    reported_by = 'self'
    AND pt_user_id IN (
      SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid()
    )
  );

-- Admins can INSERT any records
CREATE POLICY "penalty_records_insert_admin" ON penalty_records
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can UPDATE any records
CREATE POLICY "penalty_records_update_admin" ON penalty_records
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- RLS: penalty_summary
-- ============================================================
ALTER TABLE penalty_summary ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own summary
CREATE POLICY "penalty_summary_select_own" ON penalty_summary
  FOR SELECT
  USING (
    pt_user_id IN (
      SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid()
    )
  );

-- Admins can SELECT all summaries
CREATE POLICY "penalty_summary_select_admin" ON penalty_summary
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can INSERT summaries
CREATE POLICY "penalty_summary_insert_admin" ON penalty_summary
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can UPDATE summaries
CREATE POLICY "penalty_summary_update_admin" ON penalty_summary
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- Trigger: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_penalty_records_updated_at
  BEFORE UPDATE ON penalty_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_penalty_summary_updated_at
  BEFORE UPDATE ON penalty_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Function: recalculate_penalty_summary
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_penalty_summary(target_pt_user_id UUID)
RETURNS void AS $$
DECLARE
  v_total INTEGER;
  v_active INTEGER;
  v_delivery INTEGER;
  v_cs INTEGER;
  v_return INTEGER;
  v_product INTEGER;
  v_false_ad INTEGER;
  v_score INTEGER;
  v_level TEXT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT is_resolved),
    COUNT(*) FILTER (WHERE penalty_category = 'delivery_delay' AND NOT is_resolved),
    COUNT(*) FILTER (WHERE penalty_category = 'cs_nonresponse' AND NOT is_resolved),
    COUNT(*) FILTER (WHERE penalty_category = 'return_rate_excess' AND NOT is_resolved),
    COUNT(*) FILTER (WHERE penalty_category = 'product_info_mismatch' AND NOT is_resolved),
    COUNT(*) FILTER (WHERE penalty_category = 'false_advertising' AND NOT is_resolved)
  INTO v_total, v_active, v_delivery, v_cs, v_return, v_product, v_false_ad
  FROM penalty_records
  WHERE pt_user_id = target_pt_user_id;

  -- Calculate risk score based on active penalties
  v_score := LEAST(100,
    (v_delivery * 10) + (v_cs * 15) + (v_return * 20) + (v_product * 15) + (v_false_ad * 25)
  );

  -- Determine risk level
  v_level := CASE
    WHEN v_score <= 20 THEN 'safe'
    WHEN v_score <= 40 THEN 'caution'
    WHEN v_score <= 70 THEN 'warning'
    ELSE 'danger'
  END;

  INSERT INTO penalty_summary (pt_user_id, total_records, active_records, delivery_delay_count, cs_nonresponse_count, return_rate_excess_count, product_info_mismatch_count, false_advertising_count, risk_score, risk_level)
  VALUES (target_pt_user_id, v_total, v_active, v_delivery, v_cs, v_return, v_product, v_false_ad, v_score, v_level)
  ON CONFLICT (pt_user_id)
  DO UPDATE SET
    total_records = EXCLUDED.total_records,
    active_records = EXCLUDED.active_records,
    delivery_delay_count = EXCLUDED.delivery_delay_count,
    cs_nonresponse_count = EXCLUDED.cs_nonresponse_count,
    return_rate_excess_count = EXCLUDED.return_rate_excess_count,
    product_info_mismatch_count = EXCLUDED.product_info_mismatch_count,
    false_advertising_count = EXCLUDED.false_advertising_count,
    risk_score = EXCLUDED.risk_score,
    risk_level = EXCLUDED.risk_level,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
