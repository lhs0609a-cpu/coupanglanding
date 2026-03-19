-- 프로모션 v2 마이그레이션: 쿠폰 로테이션 + 다운로드 쿠폰 배치 생성 지원

-- 1. 즉시할인 쿠폰 아이템 수 추적 (로테이션용)
ALTER TABLE coupon_auto_sync_config
  ADD COLUMN IF NOT EXISTS instant_coupon_item_count INTEGER DEFAULT 0;

-- 2. product_coupon_tracking에 vendor_item_id 컬럼 (없으면 추가)
-- 참고: collect-products에서 vendor_item_id로 upsert하므로 필요
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_coupon_tracking' AND column_name = 'vendor_item_id'
  ) THEN
    ALTER TABLE product_coupon_tracking ADD COLUMN vendor_item_id TEXT;
  END IF;
END
$$;

-- 3. vendor_item_id 기반 유니크 제약조건 (collect-products의 upsert에 필요)
-- 기존 (pt_user_id, seller_product_id) 유니크 → (pt_user_id, vendor_item_id)로 변경
-- 동일 상품에 여러 옵션(vendorItem)이 있을 수 있으므로
DO $$
BEGIN
  -- 기존 seller_product_id 유니크 제거 (있으면)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'product_coupon_tracking'
    AND constraint_type = 'UNIQUE'
    AND constraint_name = 'product_coupon_tracking_pt_user_id_seller_product_id_key'
  ) THEN
    ALTER TABLE product_coupon_tracking
      DROP CONSTRAINT product_coupon_tracking_pt_user_id_seller_product_id_key;
  END IF;
END
$$;

-- vendor_item_id 유니크 추가 (없으면)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'product_coupon_tracking'
    AND constraint_type = 'UNIQUE'
    AND constraint_name = 'product_coupon_tracking_pt_user_vendor_item_key'
  ) THEN
    ALTER TABLE product_coupon_tracking
      ADD CONSTRAINT product_coupon_tracking_pt_user_vendor_item_key
      UNIQUE (pt_user_id, vendor_item_id);
  END IF;
END
$$;

-- 4. vendor_item_id 인덱스
CREATE INDEX IF NOT EXISTS idx_product_coupon_tracking_vendor_item
  ON product_coupon_tracking(vendor_item_id);
