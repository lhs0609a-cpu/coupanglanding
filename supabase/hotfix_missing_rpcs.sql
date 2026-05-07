-- 누락된 RPC 2개 보충 (migration_payment_hardening.sql 에서 추출)
-- 안전: CREATE OR REPLACE 라 기존 함수가 있으면 갱신, 없으면 신규 생성.

CREATE OR REPLACE FUNCTION payment_mark_success(
  p_tx_id UUID,
  p_payment_key TEXT,
  p_receipt_url TEXT,
  p_raw JSONB,
  p_approved_at TIMESTAMPTZ
) RETURNS VOID AS $func$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE id = p_tx_id AND status = 'success'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE id = p_tx_id AND status IN ('pending', 'failed')
  ) THEN
    RAISE EXCEPTION 'payment_mark_success: tx % not in pending/failed state', p_tx_id;
  END IF;

  UPDATE payment_transactions
     SET status = 'success',
         toss_payment_key = p_payment_key,
         receipt_url = p_receipt_url,
         raw_response = p_raw,
         approved_at = p_approved_at,
         next_retry_at = NULL,
         is_final_failure = false,
         updated_at = now()
   WHERE id = p_tx_id;

  UPDATE monthly_reports AS mr
     SET payment_status = 'confirmed',
         payment_confirmed_at = now(),
         fee_payment_status = 'paid',
         fee_confirmed_at = now(),
         fee_paid_at = now()
    FROM payment_transactions AS pt
   WHERE pt.id = p_tx_id
     AND mr.id = pt.monthly_report_id;

  UPDATE billing_cards AS bc
     SET last_used_at = now(),
         failed_count = 0
    FROM payment_transactions AS pt
   WHERE pt.id = p_tx_id
     AND pt.billing_card_id IS NOT NULL
     AND bc.id = pt.billing_card_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION payment_mark_success(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_mark_success(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO service_role;


CREATE OR REPLACE FUNCTION payment_clear_overdue_if_settled(
  p_pt_user_id UUID
) RETURNS BOOLEAN AS $func$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE pt_user_id = p_pt_user_id
       AND status = 'failed'
       AND is_final_failure = false
       AND next_retry_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM monthly_reports
     WHERE pt_user_id = p_pt_user_id
       AND fee_payment_status IN ('awaiting_payment', 'overdue', 'suspended')
  ) THEN
    RETURN false;
  END IF;

  UPDATE pt_users
     SET payment_overdue_since = NULL,
         payment_lock_level = 0,
         payment_retry_in_progress = false,
         program_access_active = true
   WHERE id = p_pt_user_id;

  RETURN true;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION payment_clear_overdue_if_settled(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_clear_overdue_if_settled(UUID) TO service_role;
