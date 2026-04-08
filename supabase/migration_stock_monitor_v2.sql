-- v2: 옵션별 품절 판정 + 구조 변경 감지
ALTER TABLE sh_stock_monitors ADD COLUMN IF NOT EXISTS registered_option_name TEXT;
ALTER TABLE sh_stock_monitors ADD COLUMN IF NOT EXISTS consecutive_unknowns INT NOT NULL DEFAULT 0;
