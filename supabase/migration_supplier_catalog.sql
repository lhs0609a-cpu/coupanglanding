-- ============================================================
-- 공급사 셀프 카탈로그 + 3자 수익쉐어 — P1 Foundation DDL
-- ============================================================
-- 모델 요약:
--  · 공급사(제조사/브랜드)가 상품을 셀프 등록(쿠팡 API 완전 대응 필드 + 구매처 링크)
--  · 셀러가 카탈로그에서 골라 로컬 에이전트로 "자기 쿠팡 계정"에 유니크 SEO로 업로드
--  · 판매는 셀러 채널 API(vendorItemId)로 실판매 검증 → supplier_sales
--  · 정산: 공급사 카드 자동결제(확정 GMV × 수수료%). 셀러는 우리에게 안 냄.
--  · 공급가(물품대금)는 셀러→공급사 직거래(구매처 링크). 우리 자금 미경유.
--
-- 설계 원칙 반영:
--  · 공유 재고풀 + 오버셀 방지 버퍼 (supplier_product_options.stock/stock_buffer)
--  · 판매가 범위 강제 (supplier_products.min_price/max_price)
--  · 유니크 SEO 무충돌 레지스트리 (supplier_listing_seo UNIQUE)
--  · 실시간(pending) vs 최종확정(confirmed=배송+7일 무반품) 분리
--  · 반품 claw-back (supplier_sales.status + supplier_settlements.clawback_amount)
--  · 멱등 dedup (supplier_sales UNIQUE(channel, order_id, vendor_item_id))
--  · RLS 로 공급사/셀러 데이터 격리 (service_role 은 bypass → cron/관리자 정상)
-- ============================================================

-- 공용 updated_at 트리거 함수 (이미 있으면 교체)
CREATE OR REPLACE FUNCTION catalog_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────
-- 1. 공급사 계정
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  brand_name TEXT,
  -- 세무/검증
  business_number TEXT,                       -- 사업자등록번호
  business_verified BOOLEAN NOT NULL DEFAULT false,
  contact_email TEXT,
  contact_phone TEXT,
  -- 브랜드 월(마퀴)용
  logo_url TEXT,
  logo_public_consent BOOLEAN NOT NULL DEFAULT true,
  -- 정산
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,   -- 플랫폼 수수료 %
  commission_base TEXT NOT NULL DEFAULT 'retail'
    CHECK (commission_base IN ('retail','supply')),       -- 수수료 산정 기준
  -- 카드 자동결제 게이트 (Toss 빌링키는 암호화 저장)
  billing_key TEXT,
  card_company TEXT,
  card_number TEXT,                           -- 마스킹된 표시용 번호
  card_registered_at TIMESTAMPTZ,
  billing_status TEXT NOT NULL DEFAULT 'no_card'
    CHECK (billing_status IN ('no_card','active','failed','suspended')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_profile_id)
);

-- ────────────────────────────────────────────────
-- 2. 카탈로그 상품 (공급사 소유, 쿠팡 API 완전 대응)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  -- 카테고리
  category_code TEXT,                          -- 쿠팡 displayCategoryCode
  category_path TEXT,
  -- 기본
  seller_product_name TEXT NOT NULL,           -- 쿠팡 sellerProductName
  display_product_name TEXT,                   -- 노출상품명 원본(셀러별 변형 전)
  brand TEXT,
  manufacturer TEXT,
  origin TEXT,
  search_tags TEXT[] NOT NULL DEFAULT '{}',
  -- 이미지 / 상세
  thumbnail_url TEXT,                          -- 대표 썸네일
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  detail_html TEXT,
  -- 쿠팡 카테고리 동적 폼 결과
  notices JSONB NOT NULL DEFAULT '{}',         -- 상품정보고시
  attributes JSONB NOT NULL DEFAULT '{}',      -- 필수속성
  certifications JSONB NOT NULL DEFAULT '[]',  -- 인증(KC 등)
  -- 판매가 범위 (셀러는 이 범위 내에서만 판매가 설정)
  min_price INTEGER NOT NULL DEFAULT 0,
  max_price INTEGER NOT NULL DEFAULT 0,
  -- 드롭십 배송/반품/AS 프로필 (공급사 발송)
  shipping_profile JSONB NOT NULL DEFAULT '{}',
  -- 검수
  preflight_report JSONB,
  rejection_reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending','approved','rejected','suspended','discontinued')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (max_price >= min_price)
);

-- ────────────────────────────────────────────────
-- 3. 상품 옵션 (공유 재고풀 + 공급가 + 구매처 링크)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_product_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL DEFAULT '기본',
  supply_price INTEGER NOT NULL DEFAULT 0,     -- 공급가(셀러 매입가)
  -- 공유 재고풀: 전 셀러가 이 stock 을 나눠 판매, 팔릴 때마다 차감
  stock INTEGER NOT NULL DEFAULT 0,
  stock_buffer INTEGER NOT NULL DEFAULT 0,     -- 오버셀 방지 조기중단 여유분
  sku TEXT,
  barcode TEXT,
  purchase_url TEXT,                           -- 구매처 링크 (셀러 사입처)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────
-- 4. 셀러 리스팅 (셀러가 자기 채널에 올린 결과)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  seller_megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'coupang'
    CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon')),
  -- 채널 식별자 (attribution 키)
  channel_product_id TEXT,                     -- 쿠팡 sellerProductId
  vendor_item_id TEXT,                         -- 불변 vendorItemId (판매 귀속 조인키)
  sku_tag TEXT,                                -- externalVendorSku 에 심은 catalog_product_id
  -- 셀러 설정
  retail_price INTEGER NOT NULL DEFAULT 0,     -- 판매가 (min~max 내)
  display_name TEXT,                           -- 생성된 유니크 노출상품명
  allocated_stock INTEGER,                     -- 이 리스팅에 배분된 재고(오버셀 방지)
  status TEXT NOT NULL DEFAULT 'registering'
    CHECK (status IN ('registering','active','suspended','failed','deleted')),
  error_message TEXT,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_megaload_user_id, catalog_product_id, channel)
);

-- ────────────────────────────────────────────────
-- 5. 유니크 SEO 레지스트리 (1000명이 올려도 이름 무충돌)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_listing_seo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  seller_megaload_user_id UUID REFERENCES megaload_users(id) ON DELETE SET NULL,
  generated_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 같은 상품에 같은 이름 금지 → 충돌 시 재생성 유도
  UNIQUE(catalog_product_id, generated_name)
);

-- ────────────────────────────────────────────────
-- 6. 정산 원장 (공급사별 월 확정 GMV · 수수료 · claw-back)
--    (attribution 이 이 FK 를 참조하므로 먼저 생성)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,                    -- 'YYYY-MM'
  gmv_confirmed BIGINT NOT NULL DEFAULT 0,     -- 확정 판매액 합
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_amount BIGINT NOT NULL DEFAULT 0,
  clawback_amount BIGINT NOT NULL DEFAULT 0,   -- 반품으로 역산 차감
  net_amount BIGINT NOT NULL DEFAULT 0,        -- 실 청구액 = commission - clawback
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','awaiting_payment','paid','failed','skipped')),
  toss_payment_key TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, year_month)
);

-- ────────────────────────────────────────────────
-- 7. 판매 귀속 (실판매 검증 · 실시간/확정 분리 · 감사추적)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  catalog_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  catalog_option_id UUID REFERENCES supplier_product_options(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES supplier_listings(id) ON DELETE SET NULL,
  seller_megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'coupang',
  -- 채널 원천 식별자 (감사추적)
  order_id TEXT NOT NULL,
  vendor_item_id TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  -- 금액 (수수료 산정 기준 둘 다 보관)
  supply_amount INTEGER NOT NULL DEFAULT 0,    -- supply_price * qty
  retail_amount INTEGER NOT NULL DEFAULT 0,    -- retail_price * qty
  -- 라이프사이클: 실시간(pending) → 최종확정(confirmed=배송+7일 무반품)
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  confirm_at TIMESTAMPTZ,                       -- delivered_at + 7일
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','returned','cancelled')),
  settlement_id UUID REFERENCES supplier_settlements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 멱등 dedup: 같은 주문라인 두 번 카운트 방지
  UNIQUE(channel, order_id, vendor_item_id)
);

-- ────────────────────────────────────────────────
-- 인덱스
-- ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_suppliers_owner ON suppliers(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_products_status ON supplier_products(status);
CREATE INDEX IF NOT EXISTS idx_catalog_options_product ON supplier_product_options(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_listings_seller ON supplier_listings(seller_megaload_user_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_listings_product ON supplier_listings(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_listings_vendoritem ON supplier_listings(vendor_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_attr_supplier ON supplier_sales(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_attr_seller ON supplier_sales(seller_megaload_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_attr_confirm ON supplier_sales(status, confirm_at);
CREATE INDEX IF NOT EXISTS idx_sales_attr_vendoritem ON supplier_sales(vendor_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_settlements_supplier ON supplier_settlements(supplier_id, year_month);

-- ────────────────────────────────────────────────
-- updated_at 트리거
-- ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_suppliers_updated ON suppliers;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();
DROP TRIGGER IF EXISTS trg_supplier_products_updated ON supplier_products;
CREATE TRIGGER trg_supplier_products_updated BEFORE UPDATE ON supplier_products
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();
DROP TRIGGER IF EXISTS trg_catalog_options_updated ON supplier_product_options;
CREATE TRIGGER trg_catalog_options_updated BEFORE UPDATE ON supplier_product_options
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();
DROP TRIGGER IF EXISTS trg_supplier_listings_updated ON supplier_listings;
CREATE TRIGGER trg_supplier_listings_updated BEFORE UPDATE ON supplier_listings
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();
DROP TRIGGER IF EXISTS trg_sales_attr_updated ON supplier_sales;
CREATE TRIGGER trg_sales_attr_updated BEFORE UPDATE ON supplier_sales
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();
DROP TRIGGER IF EXISTS trg_supplier_settlements_updated ON supplier_settlements;
CREATE TRIGGER trg_supplier_settlements_updated BEFORE UPDATE ON supplier_settlements
  FOR EACH ROW EXECUTE FUNCTION catalog_set_updated_at();

-- ────────────────────────────────────────────────
-- RLS — 공급사/셀러 데이터 격리
--   · service_role 은 모든 RLS 를 bypass → cron / 관리자(서비스 클라이언트) 정상 동작
--   · 아래 정책은 쿠키기반 인증 클라이언트(auth.uid())에만 적용됨
--   · auth.uid() = profiles.id = megaload_users.profile_id (1:1)
-- ────────────────────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_listing_seo ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_settlements ENABLE ROW LEVEL SECURITY;

-- 공급사: 자기 계정만
DROP POLICY IF EXISTS p_suppliers_owner ON suppliers;
CREATE POLICY p_suppliers_owner ON suppliers
  FOR ALL USING (owner_profile_id = auth.uid())
  WITH CHECK (owner_profile_id = auth.uid());

-- 카탈로그 상품: 공급사는 자기 것 CRUD, 셀러(인증사용자)는 승인상품 열람
DROP POLICY IF EXISTS p_supplier_products_owner ON supplier_products;
CREATE POLICY p_supplier_products_owner ON supplier_products
  FOR ALL USING (supplier_id IN (SELECT id FROM suppliers WHERE owner_profile_id = auth.uid()))
  WITH CHECK (supplier_id IN (SELECT id FROM suppliers WHERE owner_profile_id = auth.uid()));
DROP POLICY IF EXISTS p_supplier_products_browse ON supplier_products;
CREATE POLICY p_supplier_products_browse ON supplier_products
  FOR SELECT USING (status = 'approved');

-- 옵션: 상품 소유/승인 동일 규칙
DROP POLICY IF EXISTS p_catalog_options_owner ON supplier_product_options;
CREATE POLICY p_catalog_options_owner ON supplier_product_options
  FOR ALL USING (catalog_product_id IN (
    SELECT cp.id FROM supplier_products cp
    JOIN suppliers s ON s.id = cp.supplier_id
    WHERE s.owner_profile_id = auth.uid()))
  WITH CHECK (catalog_product_id IN (
    SELECT cp.id FROM supplier_products cp
    JOIN suppliers s ON s.id = cp.supplier_id
    WHERE s.owner_profile_id = auth.uid()));
DROP POLICY IF EXISTS p_catalog_options_browse ON supplier_product_options;
CREATE POLICY p_catalog_options_browse ON supplier_product_options
  FOR SELECT USING (catalog_product_id IN (
    SELECT id FROM supplier_products WHERE status = 'approved'));

-- 리스팅: 셀러는 자기 것, 공급사는 자기 상품에 걸린 것 열람
DROP POLICY IF EXISTS p_listings_seller ON supplier_listings;
CREATE POLICY p_listings_seller ON supplier_listings
  FOR ALL USING (seller_megaload_user_id IN (
    SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (seller_megaload_user_id IN (
    SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS p_listings_supplier_read ON supplier_listings;
CREATE POLICY p_listings_supplier_read ON supplier_listings
  FOR SELECT USING (catalog_product_id IN (
    SELECT cp.id FROM supplier_products cp
    JOIN suppliers s ON s.id = cp.supplier_id
    WHERE s.owner_profile_id = auth.uid()));

-- SEO 레지스트리: 셀러 본인 것 (충돌검사는 서비스 클라이언트가 수행)
DROP POLICY IF EXISTS p_seo_seller ON supplier_listing_seo;
CREATE POLICY p_seo_seller ON supplier_listing_seo
  FOR ALL USING (seller_megaload_user_id IN (
    SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (seller_megaload_user_id IN (
    SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

-- 판매 귀속: 공급사(자기 상품 실적) + 셀러(자기 판매) 열람
DROP POLICY IF EXISTS p_sales_supplier_read ON supplier_sales;
CREATE POLICY p_sales_supplier_read ON supplier_sales
  FOR SELECT USING (supplier_id IN (
    SELECT id FROM suppliers WHERE owner_profile_id = auth.uid()));
DROP POLICY IF EXISTS p_sales_seller_read ON supplier_sales;
CREATE POLICY p_sales_seller_read ON supplier_sales
  FOR SELECT USING (seller_megaload_user_id IN (
    SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

-- 정산: 공급사 본인만 열람
DROP POLICY IF EXISTS p_settlements_supplier ON supplier_settlements;
CREATE POLICY p_settlements_supplier ON supplier_settlements
  FOR SELECT USING (supplier_id IN (
    SELECT id FROM suppliers WHERE owner_profile_id = auth.uid()));
