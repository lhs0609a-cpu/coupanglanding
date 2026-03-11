-- 세금계산서 확인(confirmed) 기능 추가
ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
