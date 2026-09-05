-- 공급사 전용 회원가입 + 관리자 승인 온보딩
-- 파트너(pt_user)와 분리된 supplier 역할 + 검증 서류 필드 + 비공개 문서 버킷.

-- 1) profiles.role 에 'supplier' 추가 (기존 CHECK 교체)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'partner', 'pt_user', 'supplier'));

-- 2) suppliers 검증/심사 필드
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS representative_name   TEXT,        -- 대표자명
  ADD COLUMN IF NOT EXISTS homepage_url          TEXT,        -- 회사 홈페이지
  ADD COLUMN IF NOT EXISTS mall_url              TEXT,        -- 쇼핑몰/스토어
  ADD COLUMN IF NOT EXISTS business_license_path TEXT,        -- 사업자등록증 파일(스토리지 경로)
  ADD COLUMN IF NOT EXISTS manufacturer_doc_paths TEXT[] NOT NULL DEFAULT '{}', -- 제조/공장·상표 증빙(경로 배열)
  ADD COLUMN IF NOT EXISTS applicant_note        TEXT,        -- 신청자 메모(취급 카테고리/브랜드 등)
  ADD COLUMN IF NOT EXISTS rejection_reason      TEXT,        -- 반려 사유(재제출 안내)
  ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMPTZ, -- 가입 신청 시각
  ADD COLUMN IF NOT EXISTS reviewed_at           TIMESTAMPTZ, -- 관리자 심사 시각
  ADD COLUMN IF NOT EXISTS reviewed_by           UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_status_submitted
  ON suppliers (status, submitted_at DESC);

-- 3) 사업자등록증·증빙 비공개 버킷 (service-role 로만 업로드/서명URL 접근)
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-docs', 'supplier-docs', false)
ON CONFLICT (id) DO NOTHING;
