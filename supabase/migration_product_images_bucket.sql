-- ============================================================
-- Supabase Storage: product-images 버킷 생성
-- 상품 대표이미지, 상세이미지 등을 저장하는 공개 버킷
-- ============================================================

-- 1. 버킷 생성 (공개 접근 허용)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,                          -- 공개 버킷 (CDN URL로 직접 접근 가능)
  5242880,                       -- 5MB 제한
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS 정책: 인증된 사용자만 업로드 가능 (브라우저 직접 업로드 지원)
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- 3. RLS 정책: 누구나 읽기 가능 (공개 버킷)
CREATE POLICY "Anyone can read product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- 4. RLS 정책: 인증된 사용자가 자신의 이미지 업데이트 가능
CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

-- 5. RLS 정책: 인증된 사용자가 삭제 가능
CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- ★ 실행 필수: Supabase 대시보드 > SQL Editor에서 위 SQL 실행
-- 브라우저에서 직접 업로드하려면 INSERT 정책이 필요합니다.
