-- 대리 등록 제목 중복 방지 — 2026-09-23
--
-- 같은 카탈로그 상품을 여러 셀러에게 올릴 때 제목이 겹치면 쿠팡이 아이템위너로 묶는다.
-- generateDisplayName 은 조합 수가 유한해서 셀러가 많아지면 충돌한다(실측 0.97%).
-- 등록할 때 "이 상품에 이미 쓰인 제목"을 조회해 피하려면 제목을 남겨야 한다.
ALTER TABLE catalog_registrations
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN catalog_registrations.display_name IS
  '이 셀러에게 등록된 상품명. 같은 catalog_product 의 다른 셀러와 겹치지 않게 하는 데 쓴다.';

-- catalog_product_id 로 기존 제목을 훑는 조회가 등록마다 일어난다.
CREATE INDEX IF NOT EXISTS idx_catalog_reg_product_title
  ON catalog_registrations(catalog_product_id) WHERE display_name IS NOT NULL;
