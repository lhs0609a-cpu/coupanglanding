-- ============================================================
-- 결제 정확성 강화 마이그레이션
-- 매월 자동결제에서 1원의 오차도 없도록 무결성 트리거 + UNIQUE 제약 추가
-- 안전 재실행 가능 (IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- ============================================================
-- 1. monthly_reports 중복 행 차단
-- ------------------------------------------------------------
-- (pt_user_id, year_month) UNIQUE 가 없어 동일 월에 보고가 2번 들어가면
-- row 2개 → auto-billing이 같은 월 2번 청구 가능.
--
-- 사전 cleanup: 이미 중복이 있으면 가장 최근 row 1개만 유지.
-- 결제 완료된 row가 있으면 그것을 보존.
-- ============================================================

WITH ranked AS (
  SELECT id, pt_user_id, year_month, created_at,
         row_number() OVER (
           PARTITION BY pt_user_id, year_month
           ORDER BY
             -- paid 상태가 우선 보존
             (CASE WHEN fee_payment_status = 'paid' THEN 0 ELSE 1 END),
             created_at DESC,
             id DESC
         ) AS rn
  FROM monthly_reports
)
DELETE FROM monthly_reports WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_reports_user_month
  ON monthly_reports (pt_user_id, year_month);

-- ============================================================
-- 2. paid 상태 행 역방향 변경 보호 trigger
-- ------------------------------------------------------------
-- 사용자가 /my/report 에서 결제 완료된 월 보고서를 수정하면
-- fee_payment_status가 'paid' → 'awaiting_payment' 으로 덮어써져서
-- 다음 달 auto-billing에 다시 청구되는 이중청구 발생.
--
-- 이 trigger는 다음 회귀만 허용:
--   1) paid → cancelled (관리자 명시적 취소)
--   2) paid → awaiting_payment 단, 같은 row에 'success' status인
--      payment_transactions 가 0건일 때만 (= webhook의 정당한 결제 취소)
-- 그 외 모든 fee_payment_status / payment_status 회귀는 차단.
-- ============================================================

CREATE OR REPLACE FUNCTION protect_paid_monthly_report()
RETURNS TRIGGER AS $$
BEGIN
  -- fee_payment_status 변경 검증
  IF OLD.fee_payment_status = 'paid' AND NEW.fee_payment_status IS DISTINCT FROM OLD.fee_payment_status THEN
    -- 허용: paid → cancelled (admin 명시적 취소)
    IF NEW.fee_payment_status = 'cancelled' THEN
      -- OK
      NULL;
    -- 허용: paid → awaiting_payment 단 success 결제가 0건일 때만 (webhook 결제취소 경로)
    ELSIF NEW.fee_payment_status = 'awaiting_payment' THEN
      IF EXISTS (
        SELECT 1 FROM payment_transactions
        WHERE monthly_report_id = NEW.id
          AND status = 'success'
          AND COALESCE(is_test_transaction, false) = false
      ) THEN
        RAISE EXCEPTION 'paid 상태 리포트는 success 결제가 남아있는 한 awaiting_payment 으로 되돌릴 수 없습니다 (report=%)', NEW.id;
      END IF;
    ELSE
      RAISE EXCEPTION 'paid 상태 리포트의 fee_payment_status는 % 으로 변경할 수 없습니다 (report=%)', NEW.fee_payment_status, NEW.id;
    END IF;
  END IF;

  -- payment_status 'confirmed' 회귀 차단
  IF OLD.payment_status = 'confirmed' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NEW.payment_status NOT IN ('confirmed', 'cancelled', 'pending') THEN
      RAISE EXCEPTION 'confirmed 상태 리포트의 payment_status는 % 으로 변경할 수 없습니다', NEW.payment_status;
    END IF;
    -- pending 회귀는 webhook 결제취소 경로 — 위에서 fee_payment_status 검증과 함께 처리됨
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS monthly_reports_protect_paid ON monthly_reports;
CREATE TRIGGER monthly_reports_protect_paid
  BEFORE UPDATE ON monthly_reports
  FOR EACH ROW
  EXECUTE FUNCTION protect_paid_monthly_report();

-- ============================================================
-- 3. is_test_transaction 행이 매출/통계에 섞이지 않도록 view 추가
-- ------------------------------------------------------------
-- 향후 통계 쿼리가 SUM(total_amount) 할 때 실수로 테스트 결제 포함되는
-- 위험 차단용 view. 운영 통계는 이 view만 쓰도록 권장.
-- ============================================================

CREATE OR REPLACE VIEW v_payment_transactions_real AS
  SELECT * FROM payment_transactions
  WHERE COALESCE(is_test_transaction, false) = false;

GRANT SELECT ON v_payment_transactions_real TO authenticated;
GRANT SELECT ON v_payment_transactions_real TO service_role;
