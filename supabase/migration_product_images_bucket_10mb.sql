-- ============================================================
-- Bucket file_size_limit 5MB → 10MB
-- 서버 라우트(/api/megaload/products/bulk-register/upload-image)는
-- 이미 10MB 까지 허용하지만 버킷 cap 이 5MB 라 5~10MB 파일은 silent reject.
-- 쿠팡 DETAIL 이미지 최대 10MB 와 일치시켜 무음 실패 제거.
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 10485760  -- 10MB
WHERE id = 'product-images';

-- 확인:
-- SELECT id, name, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'product-images';
