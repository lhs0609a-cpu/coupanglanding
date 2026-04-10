-- 상품 차별화 시스템: 셀러 고유 브랜드 등록
ALTER TABLE megaload_users ADD COLUMN IF NOT EXISTS seller_brand TEXT;
ALTER TABLE megaload_users ADD COLUMN IF NOT EXISTS seller_brand_registered BOOLEAN NOT NULL DEFAULT false;
