-- ============================================================
-- SellerHub 멀티채널 이커머스 자동화 플랫폼 — Foundation DDL
-- ============================================================

-- 1. 계정/인증
CREATE TABLE IF NOT EXISTS sellerhub_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','standard','professional')),
  ai_credits INTEGER NOT NULL DEFAULT 500,
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  business_name TEXT,
  business_number TEXT,
  return_address JSONB,
  default_courier_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

CREATE TABLE IF NOT EXISTS sellerhub_sub_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','viewer')),
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon')),
  credentials JSONB NOT NULL DEFAULT '{}',
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sellerhub_user_id, channel)
);

-- 2. 상품
CREATE TABLE IF NOT EXISTS sh_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  coupang_product_id TEXT,
  product_name TEXT NOT NULL,
  display_name TEXT,
  brand TEXT,
  manufacturer TEXT,
  category_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES sh_products(id) ON DELETE CASCADE,
  sku TEXT,
  barcode TEXT,
  option_name TEXT NOT NULL DEFAULT '기본',
  option_value TEXT,
  sale_price INTEGER NOT NULL DEFAULT 0,
  cost_price INTEGER,
  weight_gram INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES sh_products(id) ON DELETE CASCADE,
  product_option_id UUID REFERENCES sh_product_options(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon')),
  channel_product_id TEXT,
  channel_sku TEXT,
  status TEXT NOT NULL DEFAULT 'not_registered' CHECK (status IN ('not_registered','pending','active','suspended','failed','deleted')),
  price_rule JSONB,
  channel_category_id TEXT,
  channel_url TEXT,
  error_message TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, channel)
);

CREATE TABLE IF NOT EXISTS sh_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES sh_products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  cdn_url TEXT,
  image_type TEXT NOT NULL DEFAULT 'main' CHECK (image_type IN ('main','detail','option','description')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  header_type TEXT NOT NULL CHECK (header_type IN ('header','footer')),
  content_html TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES sh_products(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('start_sale','end_sale','change_price')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  repeat_type TEXT DEFAULT 'once' CHECK (repeat_type IN ('once','daily','weekly','monthly')),
  config JSONB NOT NULL DEFAULT '{}',
  executed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES sh_product_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  source_category_id TEXT NOT NULL,
  source_category_name TEXT,
  channel TEXT NOT NULL,
  channel_category_id TEXT NOT NULL,
  channel_category_name TEXT,
  confidence REAL DEFAULT 0,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_sku_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  channel_option_name TEXT NOT NULL,
  internal_sku TEXT NOT NULL,
  product_option_id UUID REFERENCES sh_product_options(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_product_name_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 주문
CREATE TABLE IF NOT EXISTS sh_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  channel_order_id TEXT NOT NULL,
  order_status TEXT NOT NULL DEFAULT 'payment_done' CHECK (order_status IN (
    'payment_done','order_confirmed','shipping_ready','shipping','delivered',
    'cancel_requested','cancelled','return_requested','returned','exchange_requested','exchanged'
  )),
  buyer_name TEXT,
  buyer_phone TEXT,
  buyer_email TEXT,
  receiver_name TEXT,
  receiver_phone TEXT,
  receiver_address TEXT,
  receiver_zipcode TEXT,
  receiver_memo TEXT,
  total_amount INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  commission_fee INTEGER NOT NULL DEFAULT 0,
  courier_code TEXT,
  invoice_number TEXT,
  is_merged BOOLEAN NOT NULL DEFAULT false,
  merge_order_id UUID,
  ordered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sh_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL,
  product_option_id UUID REFERENCES sh_product_options(id) ON DELETE SET NULL,
  channel_product_id TEXT,
  product_name TEXT NOT NULL,
  option_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_order_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sh_orders(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  tag_type TEXT NOT NULL DEFAULT 'custom' CHECK (tag_type IN ('system','custom')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_order_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sh_orders(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_order_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sh_orders(id) ON DELETE CASCADE,
  gift_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  rule_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_gift_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('product','category','amount','channel','all')),
  condition_config JSONB NOT NULL DEFAULT '{}',
  gift_name TEXT NOT NULL,
  gift_quantity INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 재고
CREATE TABLE IF NOT EXISTS sh_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_option_id UUID NOT NULL REFERENCES sh_product_options(id) ON DELETE CASCADE UNIQUE,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  safety_stock INTEGER NOT NULL DEFAULT 5,
  auto_suspend_threshold INTEGER NOT NULL DEFAULT 0,
  auto_resume_threshold INTEGER NOT NULL DEFAULT 10,
  warehouse TEXT DEFAULT 'default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES sh_inventory(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('SALE','CANCEL','RETURN','MANUAL','SYNC','RESERVE','RELEASE')),
  change_quantity INTEGER NOT NULL,
  before_quantity INTEGER NOT NULL,
  after_quantity INTEGER NOT NULL,
  reference_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. 문의
CREATE TABLE IF NOT EXISTS sh_cs_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  channel_inquiry_id TEXT,
  inquiry_type TEXT,
  title TEXT,
  content TEXT NOT NULL,
  buyer_name TEXT,
  product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES sh_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','replied','resolved')),
  ai_draft_answer TEXT,
  answer TEXT,
  answered_at TIMESTAMPTZ,
  inquired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_cs_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  category TEXT,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. 정산/통계
CREATE TABLE IF NOT EXISTS sh_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  settlement_date DATE NOT NULL,
  total_sales INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_daily_sales_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  channel TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0,
  cancel_count INTEGER NOT NULL DEFAULT 0,
  return_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sellerhub_user_id, stat_date, channel)
);

-- 7. 자동화
CREATE TABLE IF NOT EXISTS sh_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('SCHEDULE','ORDER_STATUS','INVENTORY_LEVEL','API_KEY_EXPIRY')),
  action_type TEXT NOT NULL CHECK (action_type IN ('CONFIRM_ORDER','SEND_INVOICE','SUSPEND_PRODUCT','RESUME_PRODUCT','ADJUST_PRICE','SYNC_INVENTORY','NOTIFY')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES sh_automation_rules(id) ON DELETE CASCADE,
  trigger_data JSONB,
  action_result JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 시스템
CREATE TABLE IF NOT EXISTS sh_courier_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  coupang_code TEXT,
  naver_code TEXT,
  elevenst_code TEXT,
  gmarket_code TEXT,
  auction_code TEXT,
  lotteon_code TEXT,
  tracking_url_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_details JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_api_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','error','success')),
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE UNIQUE,
  ai_credits INTEGER NOT NULL DEFAULT 500,
  sms_credits INTEGER NOT NULL DEFAULT 0,
  kakao_credits INTEGER NOT NULL DEFAULT 0,
  email_credits INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_credit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('ai','sms','kakao','email')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. 인덱스
CREATE INDEX IF NOT EXISTS idx_sh_products_user ON sh_products(sellerhub_user_id);
CREATE INDEX IF NOT EXISTS idx_sh_products_coupang ON sh_products(coupang_product_id);
CREATE INDEX IF NOT EXISTS idx_sh_product_channels_channel ON sh_product_channels(channel, status);
CREATE INDEX IF NOT EXISTS idx_sh_product_options_product ON sh_product_options(product_id);
CREATE INDEX IF NOT EXISTS idx_sh_orders_user_status ON sh_orders(sellerhub_user_id, order_status);
CREATE INDEX IF NOT EXISTS idx_sh_orders_channel ON sh_orders(channel, order_status);
CREATE INDEX IF NOT EXISTS idx_sh_orders_ordered ON sh_orders(ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_sh_order_items_order ON sh_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sh_inventory_option ON sh_inventory(product_option_id);
CREATE INDEX IF NOT EXISTS idx_sh_cs_inquiries_user ON sh_cs_inquiries(sellerhub_user_id, status);
CREATE INDEX IF NOT EXISTS idx_sh_settlements_user ON sh_settlements(sellerhub_user_id, settlement_date);
CREATE INDEX IF NOT EXISTS idx_sh_api_logs_channel ON sh_api_call_logs(channel, called_at);
CREATE INDEX IF NOT EXISTS idx_sh_notifications_user ON sh_notifications(sellerhub_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sh_sync_jobs_user ON sh_sync_jobs(sellerhub_user_id, status);

-- 10. RLS 기본 정책 (필요 시 활성화)
-- ALTER TABLE sellerhub_users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sh_products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sh_orders ENABLE ROW LEVEL SECURITY;
