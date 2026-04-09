-- ============================================================
-- Megaload — 반품 요청 저장소 (쿠팡 returnRequests API 연동)
-- ============================================================

CREATE TABLE IF NOT EXISTS sh_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'coupang',
  receipt_id BIGINT NOT NULL,                    -- 쿠팡 접수번호 (API 호출 키)
  order_id BIGINT NOT NULL,
  payment_id BIGINT,
  receipt_type TEXT,                             -- RETURN / CANCEL
  receipt_status TEXT NOT NULL,                  -- RETURNS_UNCHECKED / RELEASE_STOP_UNCHECKED / VENDOR_WAREHOUSE_CONFIRM / REQUEST_COUPANG_CHECK / RETURNS_COMPLETED
  requester_name TEXT,
  requester_phone TEXT,                          -- real 우선, 없으면 안심번호
  requester_address TEXT,                        -- address + addressDetail 결합
  requester_zip_code TEXT,
  reason_category1 TEXT,
  reason_category2 TEXT,
  reason_code TEXT,
  reason_code_text TEXT,
  cancel_count_sum INT,
  return_delivery_type TEXT,                     -- 전담택배/연동택배/수기관리/""
  return_delivery_invoice_no TEXT,               -- 이미 등록된 회수 운송장 (중복 방지)
  return_delivery_company_code TEXT,
  return_shipping_charge INT,                    -- KRW, 양수=셀러 부담
  fault_by_type TEXT,                            -- CUSTOMER / VENDOR / COUPANG / WMS / GENERAL
  release_stop_status TEXT,
  product_name TEXT,                             -- returnItems[0].sellerProductName
  option_name TEXT,                              -- returnItems[0].vendorItemName
  release_status TEXT,                           -- Y/N/S/A
  channel_created_at TIMESTAMPTZ,
  channel_modified_at TIMESTAMPTZ,
  raw_data JSONB NOT NULL,                       -- 원본 전체 응답 백업
  invoice_registered_at TIMESTAMPTZ,             -- 우리 시스템에서 회수 송장 등록한 시각
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(megaload_user_id, channel, receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_sh_return_requests_user_status
  ON sh_return_requests(megaload_user_id, receipt_status);

CREATE INDEX IF NOT EXISTS idx_sh_return_requests_user_created
  ON sh_return_requests(megaload_user_id, channel_created_at DESC);

ALTER TABLE sh_return_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own return requests" ON sh_return_requests;
CREATE POLICY "Users can view own return requests"
  ON sh_return_requests FOR SELECT TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));
