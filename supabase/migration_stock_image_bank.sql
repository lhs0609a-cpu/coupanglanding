-- 큐레이션 스톡 이미지 뱅크 테이블
-- 유저가 직접 선별한 이미지를 카테고리별로 저장하여
-- Pexels 실시간 검색 대신 안정적인 이미지 배정

CREATE TABLE IF NOT EXISTS stock_image_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL,            -- 'apple', 'strawberry' 등
  category_label TEXT NOT NULL,          -- '사과', '딸기' 등
  category_path_prefix TEXT NOT NULL,    -- '식품>신선식품>과일류>과일>사과'
  storage_path TEXT NOT NULL,            -- 'megaload/stock-bank/apple/apple_001.jpg'
  cdn_url TEXT NOT NULL,                 -- Supabase 공개 URL
  original_filename TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_bank_key
  ON stock_image_bank(category_key) WHERE is_active = true;
