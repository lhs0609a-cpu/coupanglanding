-- ============================================================
-- 쿠팡 PT 회원 교육 현황 관리
-- 시트 "쿠팡PT 회원님들 교육 현황판" 디지털 전환
-- ============================================================

-- 1. 교육 모듈 마스터 (전역 공통 — 시트의 "기본" 탭에 해당)
CREATE TABLE IF NOT EXISTS pt_education_modules (
  key TEXT PRIMARY KEY,                  -- 영문 식별자 (예: 'business_registration', 'first_order')
  title TEXT NOT NULL,                   -- 한글 제목 (예: '사업자등록', '주문처리')
  category TEXT NOT NULL,                -- 'upfront' | 'operation' | 'event' | 'milestone' | 'reactive' | 'optional'
  description TEXT,
  external_link TEXT,                    -- 외부 가이드 링크 (시트의 "링크" 컬럼)
  -- 하위 항목 (시트의 옆 컬럼들): [{ key, title }]
  sub_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 트리거 조건 (자동 트리거 cron 에서 사용 — Phase B 에서 활성화)
  --   { type: 'upfront' } — 항상 노출
  --   { type: 'event', event: 'first_order' | 'first_cancel' | 'first_return' }
  --   { type: 'milestone', metric: 'product_count' | 'monthly_revenue', threshold: 1000 }
  --   { type: 'reactive' } — 사건 발생 시 수동 활성화
  --   { type: 'optional' } — 학생/트레이너 선택
  trigger_condition JSONB NOT NULL DEFAULT '{"type":"upfront"}'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- 시점 안내 메모 (시트 A 컬럼의 "상품 1000개 부터", "첫 주문시" 등)
  trigger_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edu_modules_order
  ON pt_education_modules(display_order)
  WHERE is_active;

-- 2. 학생별 진행 상태 (시트의 학생별 탭에 해당)
CREATE TABLE IF NOT EXISTS pt_education_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES pt_education_modules(key) ON UPDATE CASCADE,
  -- 상태: 'locked'(트리거 안됨) / 'triggered'(시작 대기) / 'in_progress' / 'completed' / 'needs_review'
  -- 시트의 "진행전" 은 'triggered' 또는 'locked' (upfront 모듈은 자동 triggered)
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','triggered','in_progress','completed','needs_review')),
  -- 하위 항목 진행: { '광고비': true, 'ROAS관리': false, '최적화': false }
  sub_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 진행 메타
  triggered_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- 누가 검토/완료 처리했는지
  trainer_id UUID REFERENCES profiles(id),
  -- 트레이너 메모 (다음 액션, 학생 특이사항 등)
  notes TEXT,
  -- 일시정지 시점의 진도 메모 (예: "광고비까지 설명 완료, 다음에 ROAS 부터")
  resume_point TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pt_user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_edu_progress_user
  ON pt_education_progress(pt_user_id, status);
CREATE INDEX IF NOT EXISTS idx_edu_progress_triggered
  ON pt_education_progress(triggered_at)
  WHERE status IN ('triggered', 'in_progress');

-- 3. 업데이트 트리거 (updated_at 자동 갱신)
CREATE OR REPLACE FUNCTION update_pt_education_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_edu_modules_updated ON pt_education_modules;
CREATE TRIGGER trg_edu_modules_updated
  BEFORE UPDATE ON pt_education_modules
  FOR EACH ROW EXECUTE FUNCTION update_pt_education_updated_at();

DROP TRIGGER IF EXISTS trg_edu_progress_updated ON pt_education_progress;
CREATE TRIGGER trg_edu_progress_updated
  BEFORE UPDATE ON pt_education_progress
  FOR EACH ROW EXECUTE FUNCTION update_pt_education_updated_at();

-- 4. RLS
ALTER TABLE pt_education_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_education_progress ENABLE ROW LEVEL SECURITY;

-- 모듈 마스터: 인증 사용자 read, service_role write
CREATE POLICY "edu_modules_read_authenticated"
  ON pt_education_modules FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "edu_modules_write_service_role"
  ON pt_education_modules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 학생 진행: 학생 본인은 자기 것만 read, admin/partner/trainer 는 모두 read,
-- 쓰기는 admin/partner/trainer 또는 service_role
CREATE POLICY "edu_progress_owner_select"
  ON pt_education_progress FOR SELECT
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','partner','trainer')
    )
  );

CREATE POLICY "edu_progress_admin_write"
  ON pt_education_progress FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','partner','trainer'))
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','partner','trainer'))
  );

COMMENT ON TABLE pt_education_modules IS
  '쿠팡 PT 교육 모듈 마스터 — 시트 "기본" 탭 디지털화';
COMMENT ON TABLE pt_education_progress IS
  '학생별 교육 진행 상태 — 시트 학생별 탭 디지털화';

-- ============================================================
-- 5. 시드 데이터 — 시트의 "기본" 탭 항목 그대로
-- ============================================================
INSERT INTO pt_education_modules (key, title, category, external_link, sub_modules, trigger_condition, display_order, trigger_hint) VALUES
  -- ── 입점 전 (upfront) ───────────────────────────
  ('business_registration', '사업자등록', 'upfront', NULL, '[]', '{"type":"upfront"}', 10, NULL),
  ('online_sales_report', '통신판매업 신청', 'upfront', NULL, '[]', '{"type":"upfront"}', 20, NULL),
  ('health_food_cert', '건기식 수료증', 'upfront', NULL, '[]', '{"type":"upfront"}', 30, NULL),
  ('coupang_wing_signup', '쿠팡윙 입점', 'upfront', NULL, '[]', '{"type":"upfront"}', 40, NULL),
  ('api_integration', 'API 연동', 'upfront', NULL, '[]', '{"type":"upfront"}', 50, NULL),
  ('google_drive_link', '구글드라이브 연동', 'upfront', NULL, '[]', '{"type":"upfront"}', 60, NULL),

  -- ── 운영 기본 (operation) ─────────────────────────
  ('product_upload_guide', '상품 업로드 설명', 'operation', NULL, '[]', '{"type":"upfront"}', 70, NULL),
  ('product_upload_tips', '상품 업로드 팁', 'operation', NULL, '[]', '{"type":"upfront"}', 80, NULL),

  -- ── 마일스톤 트리거 (상품 1000개+) ────────────────
  ('ai_ad_management', 'AI광고 관리', 'milestone',
    NULL,
    '[{"key":"ad_cost","title":"광고비"},{"key":"roas","title":"ROAS관리"},{"key":"optimization","title":"최적화"}]'::jsonb,
    '{"type":"milestone","metric":"product_count","threshold":1000}'::jsonb,
    90, '상품 1000개 부터'),

  -- ── 이벤트 트리거 (운영 중 발생) ──────────────────
  ('order_cancel', '주문 취소', 'event',
    NULL,
    '[{"key":"out_of_stock","title":"품절"},{"key":"stop_shipping","title":"출고중지"}]'::jsonb,
    '{"type":"event","event":"first_order_cancel"}'::jsonb,
    100, '첫 주문 취소시'),
  ('order_processing', '주문처리', 'event',
    NULL,
    '[{"key":"address","title":"주소"},{"key":"safe_number","title":"안심번호"},{"key":"tracking","title":"송장등록"}]'::jsonb,
    '{"type":"event","event":"first_order"}'::jsonb,
    110, '첫 주문시'),
  ('return_processing', '반품처리', 'event',
    NULL,
    '[{"key":"sms","title":"문자보내기"},{"key":"complaint_handling","title":"진상응대"},{"key":"self_pickup","title":"자체수거"}]'::jsonb,
    '{"type":"event","event":"first_return"}'::jsonb,
    120, '첫 반품시'),

  -- ── 반응형 (사건 발생 시 수동 활성화) ────────────
  ('brand_response', '브랜드사 대응', 'reactive',
    NULL,
    '[{"key":"email_sms","title":"이메일,문자"},{"key":"kakao_phone","title":"카톡,전화"},{"key":"customer_inquiry","title":"고객문의"}]'::jsonb,
    '{"type":"reactive"}'::jsonb,
    130, NULL),
  ('coupang_response', '쿠팡 대응', 'reactive',
    NULL,
    '[{"key":"ip_right","title":"지재권"},{"key":"trademark","title":"상표권"},{"key":"permanent_ban","title":"영구정지"}]'::jsonb,
    '{"type":"reactive"}'::jsonb,
    140, NULL),

  -- ── 마일스톤 트리거 (상품 1000개+ 추가) ──────────
  ('promotion_coupon', '프로모션 쿠폰', 'milestone',
    NULL, '[]',
    '{"type":"milestone","metric":"product_count","threshold":1000}'::jsonb,
    150, '상품 1000개 부터'),

  -- ── 선택 옵션 (추가 설정) ────────────────────────
  ('hyundai_naverpay_edition2', '현대카드 네이버페이 에디션2', 'optional', NULL, '[]', '{"type":"optional"}', 200, NULL),
  ('business_phone', '사업자 명의 핸드폰', 'optional', NULL, '[]', '{"type":"optional"}', 210, NULL),
  ('business_naver_account', '사업자 명의 네이버 계정', 'optional', NULL, '[]', '{"type":"optional"}', 220, NULL)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  sub_modules = EXCLUDED.sub_modules,
  trigger_condition = EXCLUDED.trigger_condition,
  display_order = EXCLUDED.display_order,
  trigger_hint = EXCLUDED.trigger_hint;

-- 6. 신규 pt_user 가입 시 기본 모듈 자동 시드 RPC
-- upfront 모듈은 가입 즉시 'triggered' 로 노출
CREATE OR REPLACE FUNCTION ensure_pt_education_progress(p_pt_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pt_education_progress (pt_user_id, module_key, status, triggered_at)
  SELECT
    p_pt_user_id,
    m.key,
    CASE
      WHEN m.trigger_condition->>'type' = 'upfront' THEN 'triggered'
      ELSE 'locked'
    END,
    CASE
      WHEN m.trigger_condition->>'type' = 'upfront' THEN NOW()
      ELSE NULL
    END
  FROM pt_education_modules m
  WHERE m.is_active
  ON CONFLICT (pt_user_id, module_key) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION ensure_pt_education_progress IS
  '학생에게 모든 active 모듈 progress row 를 보장 (upfront 는 즉시 triggered, 나머지는 locked)';
