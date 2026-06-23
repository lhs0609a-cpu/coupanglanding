-- =============================================
-- 멀티채널 전자동 전파 — Phase 2
-- 셀러 배송/반품/AS 템플릿 (채널별, canonical 밖 필수값)
--
-- 네이버·11번가·ESM 등은 출고지/반품지/배송비/AS 가 등록 필수.
-- 이건 상품 데이터가 아니라 셀러 레벨 값이므로 채널별 1회 세팅 → 매핑 시 주입.
-- =============================================

CREATE TABLE IF NOT EXISTS sh_channel_shipping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon','toss','kakao')),

  -- 출고지 / 반품지 (채널 주소록 코드)
  outbound_place_code TEXT,
  return_center_code TEXT,

  -- 배송비
  delivery_charge_type TEXT NOT NULL DEFAULT 'FREE'
    CHECK (delivery_charge_type IN ('FREE','NOT_FREE','CONDITIONAL_FREE')),
  delivery_charge INTEGER NOT NULL DEFAULT 0,
  free_ship_over_amount INTEGER NOT NULL DEFAULT 0,

  -- 반품/교환비
  return_charge INTEGER NOT NULL DEFAULT 0,
  exchange_charge INTEGER NOT NULL DEFAULT 0,

  -- A/S
  after_service_tel TEXT,
  after_service_guide TEXT,

  -- 원산지
  origin_code TEXT,
  origin_content TEXT,

  -- 필수값 충족 여부 (API 가 계산해 저장 — 예외큐 일괄해결 대상 판정)
  is_complete BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(megaload_user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_sh_ship_tpl_user
  ON sh_channel_shipping_templates(megaload_user_id);

-- ── RLS ──
ALTER TABLE sh_channel_shipping_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_rw_own_ship_templates" ON sh_channel_shipping_templates;
CREATE POLICY "user_rw_own_ship_templates" ON sh_channel_shipping_templates
  FOR ALL USING (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  ) WITH CHECK (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_all_ship_templates" ON sh_channel_shipping_templates;
CREATE POLICY "admin_all_ship_templates" ON sh_channel_shipping_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── updated_at 트리거 ──
-- set_updated_at_column 함수가 DB 에 없을 수 있으므로 self-contained 로 보장(멱등).
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sh_ship_tpl_updated_at ON sh_channel_shipping_templates;
CREATE TRIGGER trg_sh_ship_tpl_updated_at
  BEFORE UPDATE ON sh_channel_shipping_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- ─────────────────────────────────────────────
-- 인증 카테고리 가드 ack — 운영자가 "이 인증 보유 확인" 한 카테고리 라벨 목록.
-- cert-category-guard 가 ack 된 라벨은 차단하지 않음(블록 1회 → 이후 자동 흐름).
-- ─────────────────────────────────────────────
ALTER TABLE megaload_users
  ADD COLUMN IF NOT EXISTS cert_acknowledged TEXT[] NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────
-- ⚠️ 잠재버그 수정: sh_product_channels.megaload_user_id 누락.
--   replication-runner 가 upsert 시 megaload_user_id 를 넣는데 컬럼이 없어
--   멀티채널 등록이 실제로는 실패해 왔다(쿠팡 단독 운영이라 미발현).
--   컬럼 추가 + 기존 행 backfill + 예외큐/조회용 인덱스.
-- ─────────────────────────────────────────────
ALTER TABLE sh_product_channels
  ADD COLUMN IF NOT EXISTS megaload_user_id UUID REFERENCES megaload_users(id) ON DELETE CASCADE;

UPDATE sh_product_channels spc
  SET megaload_user_id = p.megaload_user_id
  FROM sh_products p
  WHERE spc.product_id = p.id AND spc.megaload_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_spc_user_status
  ON sh_product_channels(megaload_user_id, status);
