-- 계약서 자필 서명 데이터 컬럼 추가
-- base64 인코딩된 PNG 이미지 (data:image/png;base64,...) 저장
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signature_data TEXT;
