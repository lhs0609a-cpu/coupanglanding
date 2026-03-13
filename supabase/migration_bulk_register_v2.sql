-- ============================================================
-- 대량 상품 등록 시스템 v2 마이그레이션
-- 리뷰/정보 이미지 타입 추가 + sync_jobs result 컬럼
-- ============================================================

-- sh_product_images 테이블에 image_type 확장 (review, info 추가)
ALTER TABLE sh_product_images
  DROP CONSTRAINT IF EXISTS sh_product_images_image_type_check;
ALTER TABLE sh_product_images
  ADD CONSTRAINT sh_product_images_image_type_check
  CHECK (image_type IN ('main','detail','option','description','review','info'));

-- sh_sync_jobs에 result 컬럼 추가 (이미 코드에서 사용 중이므로 IF NOT EXISTS)
ALTER TABLE sh_sync_jobs ADD COLUMN IF NOT EXISTS result JSONB;
