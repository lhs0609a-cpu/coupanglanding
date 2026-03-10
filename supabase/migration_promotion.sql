-- 프로모션 (쿠폰 자동 적용) 마이그레이션

-- ============================================================
-- Table 1: coupon_auto_sync_config (PT유저별 쿠폰 설정 1:1)
-- ============================================================
CREATE TABLE IF NOT EXISTS coupon_auto_sync_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL UNIQUE REFERENCES pt_users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  contract_id TEXT,

  -- 즉시할인 쿠폰
  instant_coupon_enabled BOOLEAN NOT NULL DEFAULT false,
  instant_coupon_id TEXT,
  instant_coupon_name TEXT,
  instant_coupon_auto_create BOOLEAN NOT NULL DEFAULT false,
  instant_coupon_title_template TEXT DEFAULT '즉시할인 {date}',
  instant_coupon_duration_days INTEGER DEFAULT 30,
  instant_coupon_discount INTEGER DEFAULT 0,
  instant_coupon_discount_type TEXT DEFAULT 'RATE' CHECK (instant_coupon_discount_type IN ('RATE', 'FIXED')),
  instant_coupon_max_discount INTEGER DEFAULT 0,

  -- 다운로드 쿠폰
  download_coupon_enabled BOOLEAN NOT NULL DEFAULT false,
  download_coupon_id TEXT,
  download_coupon_name TEXT,
  download_coupon_auto_create BOOLEAN NOT NULL DEFAULT false,
  download_coupon_title_template TEXT DEFAULT '다운로드쿠폰 {date}',
  download_coupon_duration_days INTEGER DEFAULT 30,
  download_coupon_policies JSONB DEFAULT '[]'::jsonb,

  -- 적용 옵션
  apply_delay_days INTEGER DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Table 2: product_coupon_tracking (상품별 쿠폰 추적)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_coupon_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  seller_product_id TEXT NOT NULL,
  seller_product_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  instant_coupon_applied BOOLEAN NOT NULL DEFAULT false,
  download_coupon_applied BOOLEAN NOT NULL DEFAULT false,
  product_created_at TIMESTAMPTZ,
  coupon_apply_scheduled_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pt_user_id, seller_product_id)
);

-- ============================================================
-- Table 3: coupon_apply_log (쿠폰 적용 이력)
-- ============================================================
CREATE TABLE IF NOT EXISTS coupon_apply_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  coupon_type TEXT NOT NULL CHECK (coupon_type IN ('instant', 'download')),
  coupon_id TEXT,
  coupon_name TEXT,
  seller_product_id TEXT NOT NULL,
  vendor_item_id TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Table 4: bulk_apply_progress (일괄 적용 진행)
-- ============================================================
CREATE TABLE IF NOT EXISTS bulk_apply_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'applying', 'completed', 'failed', 'cancelled')),
  collecting_progress INTEGER NOT NULL DEFAULT 0,
  applying_progress INTEGER NOT NULL DEFAULT 0,
  total_products INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  instant_total INTEGER NOT NULL DEFAULT 0,
  instant_success INTEGER NOT NULL DEFAULT 0,
  instant_failed INTEGER NOT NULL DEFAULT 0,
  download_total INTEGER NOT NULL DEFAULT 0,
  download_success INTEGER NOT NULL DEFAULT 0,
  download_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_coupon_auto_sync_config_pt_user_id ON coupon_auto_sync_config(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_product_coupon_tracking_pt_user_id ON product_coupon_tracking(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_product_coupon_tracking_status ON product_coupon_tracking(status);
CREATE INDEX IF NOT EXISTS idx_coupon_apply_log_pt_user_id ON coupon_apply_log(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_apply_progress_pt_user_id ON bulk_apply_progress(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_apply_progress_status ON bulk_apply_progress(status);

-- ============================================================
-- RLS: coupon_auto_sync_config
-- ============================================================
ALTER TABLE coupon_auto_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupon_config_select_own" ON coupon_auto_sync_config
  FOR SELECT USING (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  );

CREATE POLICY "coupon_config_select_admin" ON coupon_auto_sync_config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "coupon_config_insert_own" ON coupon_auto_sync_config
  FOR INSERT WITH CHECK (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  );

CREATE POLICY "coupon_config_update_own" ON coupon_auto_sync_config
  FOR UPDATE USING (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  ) WITH CHECK (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  );

-- ============================================================
-- RLS: product_coupon_tracking
-- ============================================================
ALTER TABLE product_coupon_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracking_select_own" ON product_coupon_tracking
  FOR SELECT USING (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  );

CREATE POLICY "tracking_select_admin" ON product_coupon_tracking
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- RLS: coupon_apply_log
-- ============================================================
ALTER TABLE coupon_apply_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apply_log_select_own" ON coupon_apply_log
  FOR SELECT USING (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  );

CREATE POLICY "apply_log_select_admin" ON coupon_apply_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- RLS: bulk_apply_progress
-- ============================================================
ALTER TABLE bulk_apply_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_progress_select_own" ON bulk_apply_progress
  FOR SELECT USING (
    pt_user_id IN (SELECT pu.id FROM pt_users pu WHERE pu.profile_id = auth.uid())
  );

CREATE POLICY "bulk_progress_select_admin" ON bulk_apply_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Triggers: updated_at auto-update
-- ============================================================
CREATE TRIGGER set_coupon_auto_sync_config_updated_at
  BEFORE UPDATE ON coupon_auto_sync_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_product_coupon_tracking_updated_at
  BEFORE UPDATE ON product_coupon_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_bulk_apply_progress_updated_at
  BEFORE UPDATE ON bulk_apply_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
