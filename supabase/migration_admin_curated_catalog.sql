-- ============================================================
-- 관리자 큐레이팅 카탈로그 (Admin-Curated Catalog) — 2026-05-12
--
-- 목적: 관리자 H 드라이브 폴더(쿠팡PT)를 source of truth로 하여
--       30만+ 상품을 사용자가 OAuth 없이 원클릭 등록 가능하게 함.
--
-- 핵심 원칙:
--   - DB엔 텍스트 메타데이터 + Drive 파일 ID만 저장 (이미지 본체는 Drive에)
--   - 카탈로그 탐색 시 Google thumbnailLink로 직접 임베드
--   - 등록 클릭 시점에만 service account가 원본 fetch → 쿠팡 업로드
-- ============================================================

-- 1. 카테고리 (관리자 수동 분류용, 선택)
CREATE TABLE IF NOT EXISTS catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  coupang_category_id TEXT, -- 쿠팡 displayCategoryCode 매핑 힌트
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 카탈로그 상품 본체
CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Drive source-of-truth
  drive_folder_id TEXT NOT NULL UNIQUE, -- 상품 폴더 ID (Google Drive)
  drive_folder_name TEXT NOT NULL,      -- 폴더명 (상품명 fallback)
  drive_modified_time TIMESTAMPTZ,      -- Drive 폴더 마지막 수정 시간 (sync 변경 감지)

  -- 표시용 메타
  product_name TEXT NOT NULL,
  display_name TEXT,                    -- SEO 가공된 노출명
  brand TEXT,
  manufacturer TEXT,
  category_id UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
  coupang_category_code TEXT,           -- 등록 시 쓸 displayCategoryCode

  -- 가격
  suggested_price INTEGER,              -- 제안 판매가
  cost_price INTEGER,                   -- 원가 (margin 계산용)

  -- 이미지 메타 (Drive 파일 ID 배열)
  -- [{ id, name, mimeType, size, thumbnailLink, kind: 'main'|'detail'|'option' }]
  images JSONB NOT NULL DEFAULT '[]',
  main_image_count INTEGER NOT NULL DEFAULT 0,
  detail_image_count INTEGER NOT NULL DEFAULT 0,

  -- 옵션/상세 (Drive 내 product.json 또는 관리자 수동 입력)
  options JSONB NOT NULL DEFAULT '[]',  -- [{ name, value, sku, stock, price_delta }]
  notices JSONB,                        -- 쿠팡 notices 미리 채운 값
  attributes JSONB,                     -- 쿠팡 attributes 미리 채운 값
  raw_metadata JSONB,                   -- product.json 원본 보관

  -- 검수/노출 제어
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','archived')),
  is_visible BOOLEAN NOT NULL DEFAULT false, -- 사용자 카탈로그 노출 여부
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- 통계 (사용자 등록 횟수)
  register_count INTEGER NOT NULL DEFAULT 0,
  last_registered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 동기화 작업 로그
CREATE TABLE IF NOT EXISTS catalog_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  total_folders INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_details JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 사용자별 등록 이력 (재등록 방지/추적)
CREATE TABLE IF NOT EXISTS catalog_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  sh_product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL, -- 등록 결과로 생긴 사용자 상품
  channel TEXT NOT NULL DEFAULT 'coupang' CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon')),
  channel_product_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','registering','succeeded','failed')),
  error_message TEXT,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(catalog_product_id, megaload_user_id, channel)
);

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_catalog_products_status_visible
  ON catalog_products(status, is_visible);
CREATE INDEX IF NOT EXISTS idx_catalog_products_category
  ON catalog_products(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_products_drive_modified
  ON catalog_products(drive_modified_time DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_products_register_count
  ON catalog_products(register_count DESC) WHERE is_visible = true;

-- 검색용 (한글 trigram). 확장 없으면 ILIKE로 폴백 가능.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_catalog_products_name_trgm
  ON catalog_products USING gin (product_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_registrations_user
  ON catalog_registrations(megaload_user_id, status);
CREATE INDEX IF NOT EXISTS idx_catalog_registrations_product
  ON catalog_registrations(catalog_product_id);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_jobs_status
  ON catalog_sync_jobs(status, created_at DESC);

-- 6. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION trg_catalog_products_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_products_set_updated_at ON catalog_products;
CREATE TRIGGER catalog_products_set_updated_at
  BEFORE UPDATE ON catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION trg_catalog_products_set_updated_at();

DROP TRIGGER IF EXISTS catalog_categories_set_updated_at ON catalog_categories;
CREATE TRIGGER catalog_categories_set_updated_at
  BEFORE UPDATE ON catalog_categories
  FOR EACH ROW
  EXECUTE FUNCTION trg_catalog_products_set_updated_at();

-- 7. 등록 카운터 자동 증가
CREATE OR REPLACE FUNCTION trg_catalog_bump_register_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'succeeded' AND (OLD.status IS DISTINCT FROM 'succeeded') THEN
    UPDATE catalog_products
       SET register_count = register_count + 1,
           last_registered_at = now()
     WHERE id = NEW.catalog_product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_registrations_bump_count ON catalog_registrations;
CREATE TRIGGER catalog_registrations_bump_count
  AFTER UPDATE ON catalog_registrations
  FOR EACH ROW
  EXECUTE FUNCTION trg_catalog_bump_register_count();

-- 8. RLS — 기본 비활성. API 라우트에서 권한 검증.
-- (megaload 관행: service client로 admin 검증 후 접근)
