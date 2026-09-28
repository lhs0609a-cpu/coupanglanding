-- 카탈로그 상품에 재고·품목 판정값 저장 — 2026-09-27
--
-- 대리 등록 때 "품절 아닌 것", "시즌인 것"만 골라야 하는데, 그 근거는 소싱 원본
-- (sh_naver_sourcing_products.detail.options[].soldOut / category_path)에 있다.
-- 등록할 때마다 조인하면 느리고, 등록 스크립트가 소싱 테이블 구조까지 알아야 한다.
-- 카탈로그로 옮길 때 한 번 판정해 여기 박아둔다.

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN,
  ADD COLUMN IF NOT EXISTS fruit_kind TEXT;

COMMENT ON COLUMN catalog_products.in_stock IS
  '소싱 원본 옵션 중 soldOut=false 가 하나라도 있으면 true. 옵션 정보가 없으면 NULL(판정 불가).';
COMMENT ON COLUMN catalog_products.fruit_kind IS
  '품목명(참외/멜론/키위 등). 시즌 판정에 쓴다. 소싱 category_path 의 마지막 단계.';

-- 기존 행 백필
UPDATE catalog_products p
SET
  in_stock = CASE
    WHEN jsonb_array_length(COALESCE(s.detail->'options', '[]'::jsonb)) = 0 THEN NULL
    ELSE EXISTS (
      SELECT 1 FROM jsonb_array_elements(s.detail->'options') o
      WHERE (o->>'soldOut')::boolean IS FALSE
    )
  END,
  fruit_kind = NULLIF(btrim(split_part(s.category_path, '>', 3)), '')
FROM sh_naver_sourcing_products s
WHERE s.id = (p.raw_metadata->>'sourcing_id')::uuid;

CREATE INDEX IF NOT EXISTS idx_catalog_products_stock_kind
  ON catalog_products(in_stock, fruit_kind) WHERE is_visible = true;
