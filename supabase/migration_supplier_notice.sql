-- 공급사 → 셀러 공지 (제휴상품별). 공급사가 상품에 짧은 공지를 달면
-- 그 상품을 판매하는 전 셀러가 제휴상품 카탈로그에서 확인.
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS supplier_notice TEXT,
  ADD COLUMN IF NOT EXISTS supplier_notice_at TIMESTAMPTZ;

COMMENT ON COLUMN supplier_products.supplier_notice IS '공급사가 셀러에게 남기는 상품 공지(재고보충 예정/단종 예고 등). NULL이면 공지 없음.';
COMMENT ON COLUMN supplier_products.supplier_notice_at IS '공지 최종 수정 시각.';
