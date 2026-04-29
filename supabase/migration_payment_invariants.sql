-- ============================================================
-- 결제 무결성 강화 마이그레이션 (2026-04 audit follow-up)
-- 안전 재실행 가능 (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ------------------------------------------------------------
-- 0. revenue_entries.source_ref — migration_payment_hardening.sql 의 ADD COLUMN 이
--    적용 안 된 환경에서도 본 마이그레이션이 자가 충족적으로 동작하도록 idempotent 추가.
-- ------------------------------------------------------------
ALTER TABLE revenue_entries
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_entries_source
  ON revenue_entries (year_month, source, source_ref)
  WHERE source_ref IS NOT NULL;


-- ------------------------------------------------------------
-- 1. monthly_reports.settlement_completed_at — 정산 후처리 멱등 가드
-- ------------------------------------------------------------
-- 기존 completeSettlement 가드는 monthly_reports.payment_status='confirmed' 를 봤는데,
-- payment_mark_success RPC 가 이미 payment_status='confirmed' 로 atomic 마킹하므로
-- completeSettlement 호출 시점엔 항상 0건이 매칭되어 revenue_entries / trainer_earnings /
-- 세금계산서 후처리가 영구적으로 skip 되던 버그를 차단.
-- 새 컬럼은 후처리 완료 시점만 추적한다.

ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS settlement_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_monthly_reports_settlement_pending
  ON monthly_reports (id)
  WHERE settlement_completed_at IS NULL AND fee_payment_status = 'paid';

-- 백필: 이미 revenue_entries 가 생성된 리포트는 후처리 완료로 간주.
-- (그렇지 않은 confirmed 리포트는 NULL 로 남아 다음 호출에서 후처리 재실행됨)
UPDATE monthly_reports mr
   SET settlement_completed_at = COALESCE(mr.payment_confirmed_at, now())
 WHERE mr.payment_status = 'confirmed'
   AND mr.settlement_completed_at IS NULL
   AND EXISTS (
     SELECT 1 FROM revenue_entries re
      WHERE re.source = 'pt' AND re.source_ref::text = mr.id::text
   );


-- ------------------------------------------------------------
-- 2. billing_card_register_primary — 신규 카드 등록 원자화
-- ------------------------------------------------------------
-- 기존 코드는 INSERT(is_primary=true) → 별도 UPDATE 로 기존 primary demote.
-- 두 단계 사이에 다른 호출이 .eq('is_primary',true).maybeSingle() 하면
-- 다중 행 에러 → "카드 없음" 으로 처리되는 race window 가 있었음.
-- 이 함수는 demote → insert 를 한 트랜잭션에서 수행한다.

CREATE OR REPLACE FUNCTION billing_card_register_primary(
  p_pt_user_id UUID,
  p_customer_key TEXT,
  p_billing_key TEXT,
  p_card_company TEXT,
  p_card_number TEXT,
  p_card_type TEXT,
  p_registered_at TIMESTAMPTZ
) RETURNS billing_cards AS $func$
DECLARE
  v_row billing_cards;
BEGIN
  UPDATE billing_cards
     SET is_primary = false
   WHERE pt_user_id = p_pt_user_id
     AND is_primary = true;

  INSERT INTO billing_cards (
    pt_user_id, customer_key, billing_key,
    card_company, card_number, card_type,
    is_active, is_primary, registered_at
  ) VALUES (
    p_pt_user_id, p_customer_key, p_billing_key,
    p_card_company, p_card_number, p_card_type,
    true, true, p_registered_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION billing_card_register_primary(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_card_register_primary(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;


-- ------------------------------------------------------------
-- 3. payment_schedule_increment — 카운터 atomic 증분
-- ------------------------------------------------------------
-- 기존 read-modify-write (`.update({ total_success_count: (existing||0)+1 })`) 는
-- 동시 cron(자동결제 + 재시도 + 즉시결제) 실행 시 카운터 손실 가능.
-- relative increment 로 race-free 보장.

CREATE OR REPLACE FUNCTION payment_schedule_increment(
  p_schedule_id UUID,
  p_success_delta INTEGER DEFAULT 0,
  p_failed_delta INTEGER DEFAULT 0,
  p_set_last_charged BOOLEAN DEFAULT false
) RETURNS VOID AS $func$
BEGIN
  UPDATE payment_schedules
     SET total_success_count = COALESCE(total_success_count, 0) + p_success_delta,
         total_failed_count = COALESCE(total_failed_count, 0) + p_failed_delta,
         last_charged_at = CASE
           WHEN p_set_last_charged THEN now()
           ELSE last_charged_at
         END
   WHERE id = p_schedule_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION payment_schedule_increment(UUID, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_schedule_increment(UUID, INTEGER, INTEGER, BOOLEAN) TO service_role;


-- ------------------------------------------------------------
-- 4. billing_cards.failed_count atomic 증분
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing_card_increment_failed(
  p_card_id UUID
) RETURNS VOID AS $func$
BEGIN
  UPDATE billing_cards
     SET failed_count = COALESCE(failed_count, 0) + 1
   WHERE id = p_card_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION billing_card_increment_failed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_card_increment_failed(UUID) TO service_role;


-- ------------------------------------------------------------
-- 5. trainer total_earnings atomic 증분
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trainer_increment_total_earnings(
  p_trainer_id UUID,
  p_delta BIGINT
) RETURNS VOID AS $func$
BEGIN
  UPDATE trainers
     SET total_earnings = COALESCE(total_earnings, 0) + p_delta
   WHERE id = p_trainer_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION trainer_increment_total_earnings(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainer_increment_total_earnings(UUID, BIGINT) TO service_role;


-- ------------------------------------------------------------
-- 6. payment-lock-update 인덱스 — 부분 인덱스로 풀스캔 회피
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pt_users_lock_calc_candidates
  ON pt_users (id)
  WHERE payment_overdue_since IS NOT NULL
     OR payment_retry_in_progress = true;
