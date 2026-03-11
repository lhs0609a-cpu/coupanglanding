-- 프로모션 쿠폰 적용: vendor_item_id 추가
-- 쿠팡 API는 coupon 적용 시 vendorItemId를 필요로 함 (sellerProductId가 아님)

-- product_coupon_tracking에 vendor_item_id 컬럼 추가
ALTER TABLE product_coupon_tracking ADD COLUMN IF NOT EXISTS vendor_item_id TEXT;

-- 기존 unique constraint 삭제 후 vendor_item_id 포함 재생성
ALTER TABLE product_coupon_tracking DROP CONSTRAINT IF EXISTS product_coupon_tracking_pt_user_id_seller_product_id_key;
ALTER TABLE product_coupon_tracking ADD CONSTRAINT product_coupon_tracking_pt_user_vendor_item_key UNIQUE (pt_user_id, vendor_item_id);

-- vendor_item_id 인덱스
CREATE INDEX IF NOT EXISTS idx_product_coupon_tracking_vendor_item ON product_coupon_tracking(vendor_item_id);
