-- 공급사 기본 배송/반품/A/S 프로필 — 상품마다 반복입력 대신 계정에 1회 저장 → 자동 상속
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS default_shipping_profile JSONB NOT NULL DEFAULT '{}';
