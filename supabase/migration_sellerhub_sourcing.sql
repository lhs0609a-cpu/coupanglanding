-- ============================================================
-- SellerHub 소싱 모듈 DDL
-- ============================================================

-- 1. 소싱 계정
CREATE TABLE IF NOT EXISTS sh_sourcing_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('aliexpress','ali1688')),
  account_name TEXT,
  app_key TEXT,
  app_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sellerhub_user_id, platform)
);

-- 2. 소싱 상품
CREATE TABLE IF NOT EXISTS sh_sourcing_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sh_sourcing_sources(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('aliexpress','ali1688')),
  platform_product_id TEXT NOT NULL,
  original_url TEXT,
  original_title TEXT NOT NULL,
  translated_title TEXT,
  original_description TEXT,
  translated_description TEXT,
  original_images JSONB DEFAULT '[]',
  processed_images JSONB DEFAULT '[]',
  supplier_name TEXT,
  supplier_rating REAL,
  supplier_url TEXT,
  brand_check_result TEXT CHECK (brand_check_result IN ('safe','warning','blocked')),
  brand_check_details JSONB,
  sell_type TEXT NOT NULL DEFAULT 'dropshipping' CHECK (sell_type IN ('dropshipping','wholesale')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','registered','suspended','deleted')),
  linked_product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sh_sourcing_product_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourcing_product_id UUID NOT NULL REFERENCES sh_sourcing_products(id) ON DELETE CASCADE,
  original_option_name TEXT,
  translated_option_name TEXT,
  price_cny REAL NOT NULL DEFAULT 0,
  price_krw INTEGER NOT NULL DEFAULT 0,
  sale_price_krw INTEGER,
  moq INTEGER NOT NULL DEFAULT 1,
  stock INTEGER,
  sku_image_url TEXT,
  weight_gram INTEGER,
  linked_option_id UUID REFERENCES sh_product_options(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 마진/환율 정책
CREATE TABLE IF NOT EXISTS sh_sourcing_price_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  config_type TEXT NOT NULL CHECK (config_type IN ('global','platform','category','product')),
  reference_id TEXT,
  margin_rate REAL NOT NULL DEFAULT 30,
  exchange_rate_buffer REAL NOT NULL DEFAULT 3,
  domestic_shipping_fee INTEGER NOT NULL DEFAULT 0,
  international_shipping_fee INTEGER NOT NULL DEFAULT 0,
  customs_rate REAL NOT NULL DEFAULT 0,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 발주
CREATE TABLE IF NOT EXISTS sh_sourcing_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  sourcing_product_id UUID REFERENCES sh_sourcing_products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES sh_orders(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  platform_order_id TEXT,
  order_type TEXT NOT NULL CHECK (order_type IN ('dropshipping','wholesale')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ordered','shipped','domestic_received','completed','cancelled','failed')),
  quantity INTEGER NOT NULL DEFAULT 1,
  total_cny REAL,
  total_krw INTEGER,
  shipping_agent TEXT,
  domestic_courier TEXT,
  domestic_invoice TEXT,
  error_message TEXT,
  ordered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. 해외 배송 추적
CREATE TABLE IF NOT EXISTS sh_sourcing_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourcing_order_id UUID NOT NULL REFERENCES sh_sourcing_orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  carrier TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  status_details JSONB DEFAULT '[]',
  last_checked_at TIMESTAMPTZ,
  domestic_converted BOOLEAN NOT NULL DEFAULT false,
  domestic_courier TEXT,
  domestic_invoice TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. 환율
CREATE TABLE IF NOT EXISTS sh_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_pair TEXT NOT NULL DEFAULT 'CNY_KRW',
  rate REAL NOT NULL,
  source TEXT DEFAULT 'koreaexim',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. 관세율
CREATE TABLE IF NOT EXISTS sh_customs_duty_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hs_code TEXT NOT NULL,
  category_name TEXT,
  duty_rate REAL NOT NULL DEFAULT 8,
  vat_rate REAL NOT NULL DEFAULT 10,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 찜 목록
CREATE TABLE IF NOT EXISTS sh_sourcing_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellerhub_user_id UUID NOT NULL REFERENCES sellerhub_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_product_id TEXT NOT NULL,
  product_url TEXT,
  title TEXT,
  image_url TEXT,
  price_cny REAL,
  price_krw INTEGER,
  last_price_cny REAL,
  price_changed BOOLEAN NOT NULL DEFAULT false,
  supplier_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sellerhub_user_id, platform, platform_product_id)
);

-- 9. 지재권 브랜드 DB
CREATE TABLE IF NOT EXISTS sh_brand_protection_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  brand_name_ko TEXT,
  brand_name_cn TEXT,
  category TEXT,
  risk_level TEXT NOT NULL DEFAULT 'high' CHECK (risk_level IN ('low','medium','high')),
  keywords JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. 인덱스
CREATE INDEX IF NOT EXISTS idx_sh_sourcing_products_user ON sh_sourcing_products(sellerhub_user_id);
CREATE INDEX IF NOT EXISTS idx_sh_sourcing_products_platform ON sh_sourcing_products(platform, platform_product_id);
CREATE INDEX IF NOT EXISTS idx_sh_sourcing_orders_user ON sh_sourcing_orders(sellerhub_user_id, status);
CREATE INDEX IF NOT EXISTS idx_sh_sourcing_tracking_order ON sh_sourcing_tracking(sourcing_order_id);
CREATE INDEX IF NOT EXISTS idx_sh_exchange_rates_pair ON sh_exchange_rates(currency_pair, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_sh_wishlist_user ON sh_sourcing_wishlist(sellerhub_user_id);
CREATE INDEX IF NOT EXISTS idx_sh_brand_protection ON sh_brand_protection_list(brand_name);
