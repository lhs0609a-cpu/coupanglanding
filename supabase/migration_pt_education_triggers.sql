-- ============================================================
-- 교육 모듈 자동 트리거 — DB trigger (cron 없음, 함수 호출 0)
--
-- 학생의 실제 운영 활동을 감지해서 교육 모듈을 'locked' → 'triggered' 자동 전환.
-- 시트로는 사람이 매번 확인해야 알지만, 이건 INSERT/UPDATE 시점에 즉시 반영.
--
-- 매핑:
--   sh_orders 첫 INSERT                → 'order_processing' triggered
--   sh_orders.status='cancelled' 첫 발생 → 'order_cancel' triggered
--   sh_orders.status='returned' 첫 발생  → 'return_processing' triggered
--   sh_products count >= 1000           → 'ai_ad_management', 'promotion_coupon' triggered
--   sh_products count >= 100            → 'product_upload_tips' triggered
-- ============================================================

-- 헬퍼: megaload_user_id → pt_user_id 매핑
CREATE OR REPLACE FUNCTION _megaload_to_pt_user(p_megaload_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_pt_user_id UUID;
BEGIN
  SELECT pu.id INTO v_pt_user_id
  FROM megaload_users mu
  JOIN pt_users pu ON pu.profile_id = mu.profile_id
  WHERE mu.id = p_megaload_user_id
  LIMIT 1;
  RETURN v_pt_user_id;
END;
$$;

-- 헬퍼: 모듈을 'triggered' 로 자동 전환 (이미 진행/완료된 건 건드리지 않음)
CREATE OR REPLACE FUNCTION _trigger_education_module(
  p_pt_user_id UUID,
  p_module_key TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_pt_user_id IS NULL THEN RETURN; END IF;

  INSERT INTO pt_education_progress (pt_user_id, module_key, status, triggered_at)
  VALUES (p_pt_user_id, p_module_key, 'triggered', NOW())
  ON CONFLICT (pt_user_id, module_key) DO UPDATE SET
    -- locked → triggered 전환만 허용. 이미 in_progress/completed/needs_review 면 유지.
    status = CASE
      WHEN pt_education_progress.status = 'locked' THEN 'triggered'
      ELSE pt_education_progress.status
    END,
    triggered_at = COALESCE(pt_education_progress.triggered_at, NOW());
END;
$$;

-- ── 1. sh_orders INSERT → 첫 주문 트리거 ──────────────────────
CREATE OR REPLACE FUNCTION trg_sh_orders_education()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pt_user_id UUID;
  v_is_first BOOLEAN;
BEGIN
  v_pt_user_id := _megaload_to_pt_user(NEW.megaload_user_id);
  IF v_pt_user_id IS NULL THEN RETURN NEW; END IF;

  -- INSERT: 첫 주문이면 'order_processing' trigger
  IF TG_OP = 'INSERT' THEN
    -- 같은 megaload_user 의 이전 주문 존재 여부 (이 row 제외)
    SELECT NOT EXISTS (
      SELECT 1 FROM sh_orders
      WHERE megaload_user_id = NEW.megaload_user_id AND id <> NEW.id
    ) INTO v_is_first;
    IF v_is_first THEN
      PERFORM _trigger_education_module(v_pt_user_id, 'order_processing');
    END IF;
  END IF;

  -- UPDATE: 상태가 cancelled 로 바뀐 첫 케이스
  IF TG_OP = 'UPDATE' AND NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' THEN
    PERFORM _trigger_education_module(v_pt_user_id, 'order_cancel');
  END IF;

  -- UPDATE: 상태가 returned 로 바뀐 첫 케이스
  IF TG_OP = 'UPDATE' AND NEW.order_status = 'returned' AND OLD.order_status <> 'returned' THEN
    PERFORM _trigger_education_module(v_pt_user_id, 'return_processing');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sh_orders_education_insert ON sh_orders;
CREATE TRIGGER trg_sh_orders_education_insert
  AFTER INSERT ON sh_orders
  FOR EACH ROW EXECUTE FUNCTION trg_sh_orders_education();

DROP TRIGGER IF EXISTS trg_sh_orders_education_update ON sh_orders;
CREATE TRIGGER trg_sh_orders_education_update
  AFTER UPDATE OF order_status ON sh_orders
  FOR EACH ROW EXECUTE FUNCTION trg_sh_orders_education();

-- ── 2. sh_products count milestone (1000개 / 100개) ──────────
-- 매번 count 하면 비싸므로: INSERT 시점에만 체크.
-- 100개 / 1000개 도달 직후 1회만 trigger.
CREATE OR REPLACE FUNCTION trg_sh_products_education()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pt_user_id UUID;
  v_count INTEGER;
BEGIN
  v_pt_user_id := _megaload_to_pt_user(NEW.megaload_user_id);
  IF v_pt_user_id IS NULL THEN RETURN NEW; END IF;

  -- 같은 셀러의 활성 상품 개수
  SELECT COUNT(*) INTO v_count
  FROM sh_products
  WHERE megaload_user_id = NEW.megaload_user_id;

  -- 100개 도달 — '상품 업로드 팁'
  IF v_count >= 100 THEN
    PERFORM _trigger_education_module(v_pt_user_id, 'product_upload_tips');
  END IF;

  -- 1000개 도달 — AI광고 + 프로모션 쿠폰
  IF v_count >= 1000 THEN
    PERFORM _trigger_education_module(v_pt_user_id, 'ai_ad_management');
    PERFORM _trigger_education_module(v_pt_user_id, 'promotion_coupon');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sh_products_education_insert ON sh_products;
CREATE TRIGGER trg_sh_products_education_insert
  AFTER INSERT ON sh_products
  FOR EACH ROW EXECUTE FUNCTION trg_sh_products_education();

COMMENT ON FUNCTION trg_sh_orders_education IS
  '주문/취소/반품 발생 시 교육 모듈 자동 trigger — cron 없이 DB level 처리';
COMMENT ON FUNCTION trg_sh_products_education IS
  '상품 등록 milestone 도달 시 AI광고/팁 자동 trigger';
