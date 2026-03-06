-- VAT(부가가치세) 및 세금계산서 통합 마이그레이션
-- 실행 순서: 이 파일을 Supabase SQL Editor에서 실행

-- 1. company_settings 테이블 (세금계산서 발행을 위한 회사 사업자 정보)
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL DEFAULT '',
  business_registration_number TEXT NOT NULL DEFAULT '',
  representative_name TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT '',
  business_category TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 초기 데이터 삽입 (빈 레코드)
INSERT INTO company_settings (business_name) VALUES ('')
ON CONFLICT DO NOTHING;

-- 2. pt_users에 사업자 정보 컬럼 추가
ALTER TABLE pt_users
  ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_registration_number TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_representative TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_category TEXT DEFAULT NULL;

-- 3. monthly_reports에 VAT 컬럼 추가
ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS supply_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_with_vat INTEGER DEFAULT 0;

-- 4. tax_invoices 테이블 생성
CREATE TABLE IF NOT EXISTS tax_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  monthly_report_id UUID NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  -- 공급자 (회사) 정보
  supplier_business_name TEXT NOT NULL,
  supplier_registration_number TEXT NOT NULL,
  supplier_representative TEXT NOT NULL,
  supplier_address TEXT NOT NULL,
  supplier_business_type TEXT DEFAULT '',
  supplier_business_category TEXT DEFAULT '',
  -- 공급받는자 (PT 사용자) 정보
  buyer_business_name TEXT NOT NULL,
  buyer_registration_number TEXT NOT NULL,
  buyer_representative TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  buyer_business_type TEXT DEFAULT '',
  buyer_business_category TEXT DEFAULT '',
  -- 금액
  supply_amount INTEGER NOT NULL,
  vat_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  -- 상태
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  issued_at TIMESTAMPTZ DEFAULT now(),
  cancelled_at TIMESTAMPTZ DEFAULT NULL,
  cancelled_reason TEXT DEFAULT NULL,
  -- 메모
  description TEXT DEFAULT '쿠팡 셀러 PT 코칭 수수료',
  admin_note TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_tax_invoices_pt_user_id ON tax_invoices(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_year_month ON tax_invoices(year_month);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_status ON tax_invoices(status);

-- 5. RLS 정책

-- company_settings: 관리자만 읽기/쓰기
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_company_settings" ON company_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_update_company_settings" ON company_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- tax_invoices: 관리자 전체, PT사용자 본인만
ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_tax_invoices" ON tax_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "pt_user_read_own_tax_invoices" ON tax_invoices
  FOR SELECT USING (
    pt_user_id IN (
      SELECT id FROM pt_users WHERE profile_id = auth.uid()
    )
  );
