-- ============================================================
-- 관리자 일괄 대리 등록 (Admin Bulk Register) — 2026-09-23
--
-- 관리자가 카탈로그 상품을 "등록 가능한" 셀러 계정들에 일괄 등록한다.
-- 대상은 자동 선별: 쿠팡 API 키가 살아있고 + 쿠팡에 출고지/반품지가 잡혀 있는 계정만.
--
-- 안전장치 (계정이 망가지지 않도록):
--   - dry_run 기본값 true — 먼저 시뮬레이션하고 결과를 본 뒤 실제 실행
--   - per_user_limit — 유저당 최대 등록 수 (주문 폭주 → 미출고 페널티 방지)
--   - opt_out — 대리 등록을 원치 않는 셀러 제외
--   - 실패율 임계치 초과 시 캠페인 자동 중단
-- ============================================================

-- 1. 쿠팡 물류코드 캐시 + 대리등록 거부 플래그
--    출고지/반품지는 쿠팡에서 조회해 여기 캐시한다 (megaload_users.return_address 는
--    44명 중 3명만 채워져 있어 신뢰할 수 없다 — 쿠팡 쪽이 source of truth).
ALTER TABLE megaload_users
  ADD COLUMN IF NOT EXISTS coupang_outbound_code TEXT,
  ADD COLUMN IF NOT EXISTS coupang_return_code TEXT,
  ADD COLUMN IF NOT EXISTS coupang_shipping_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coupang_shipping_error TEXT,
  ADD COLUMN IF NOT EXISTS bulk_register_opt_out BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN megaload_users.coupang_outbound_code IS
  '쿠팡 출고지코드 캐시 — 대리 등록 시 deliveryInfo 에 사용. eligibility 점검 때 갱신.';
COMMENT ON COLUMN megaload_users.bulk_register_opt_out IS
  '관리자 대리 등록 거부. true 면 어떤 캠페인에서도 대상에서 제외된다.';

-- 2. 캠페인 (관리자가 만드는 일괄 등록 1회분)
CREATE TABLE IF NOT EXISTS catalog_bulk_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,

  -- 무엇을
  catalog_product_ids UUID[] NOT NULL DEFAULT '{}',

  -- 누구에게 — 'eligible_all'(가능한 계정 전체) | 'dormant'(휴면만) | 'manual'(직접 지정)
  target_filter TEXT NOT NULL DEFAULT 'eligible_all'
    CHECK (target_filter IN ('eligible_all', 'dormant', 'manual')),
  target_user_ids UUID[] NOT NULL DEFAULT '{}',   -- manual 일 때만 사용

  -- 안전장치
  dry_run BOOLEAN NOT NULL DEFAULT true,
  per_user_limit INTEGER NOT NULL DEFAULT 10 CHECK (per_user_limit BETWEEN 1 AND 200),
  abort_failure_rate NUMERIC NOT NULL DEFAULT 0.30,  -- 실패율 30% 초과 → 자동 중단

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'aborted')),
  abort_reason TEXT,

  -- 집계
  total_targets INTEGER NOT NULL DEFAULT 0,
  done_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 개별 작업 (캠페인 × 셀러 × 카탈로그상품)
CREATE TABLE IF NOT EXISTS catalog_bulk_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES catalog_bulk_campaigns(id) ON DELETE CASCADE,
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  catalog_product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),

  -- 대표이미지 배정 — 캠페인 안에서 셀러끼리 같은 대표이미지를 쓰지 않도록
  -- 생성 시점에 라운드로빈으로 정해둔다. (셀러 수 > 이미지 수 면 순환하며 재사용)
  main_image_index INTEGER,
  skip_reason TEXT,          -- 'opt_out' | 'no_credentials' | 'no_shipping' | 'already_registered' | 'limit'
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,

  -- 결과
  channel_product_id TEXT,
  sh_product_id UUID REFERENCES sh_products(id) ON DELETE SET NULL,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(campaign_id, megaload_user_id, catalog_product_id)
);

CREATE INDEX IF NOT EXISTS idx_bulk_targets_campaign_status
  ON catalog_bulk_targets(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_bulk_targets_pending
  ON catalog_bulk_targets(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_status
  ON catalog_bulk_campaigns(status, created_at DESC);

-- 4. RLS — 관리자 읽기, 서비스롤 쓰기
ALTER TABLE catalog_bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_bulk_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bulk_campaigns_admin_read" ON catalog_bulk_campaigns;
CREATE POLICY "bulk_campaigns_admin_read" ON catalog_bulk_campaigns FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "bulk_campaigns_service_write" ON catalog_bulk_campaigns;
CREATE POLICY "bulk_campaigns_service_write" ON catalog_bulk_campaigns FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "bulk_targets_admin_read" ON catalog_bulk_targets;
CREATE POLICY "bulk_targets_admin_read" ON catalog_bulk_targets FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "bulk_targets_owner_read" ON catalog_bulk_targets;
CREATE POLICY "bulk_targets_owner_read" ON catalog_bulk_targets FOR SELECT
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "bulk_targets_service_write" ON catalog_bulk_targets;
CREATE POLICY "bulk_targets_service_write" ON catalog_bulk_targets FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE catalog_bulk_campaigns IS
  '관리자 일괄 대리 등록 캠페인 — dry_run 으로 먼저 검증 후 실제 실행';
COMMENT ON TABLE catalog_bulk_targets IS
  '캠페인의 개별 작업 단위 (셀러 × 카탈로그상품). 워커가 pending 을 집어 처리한다.';
