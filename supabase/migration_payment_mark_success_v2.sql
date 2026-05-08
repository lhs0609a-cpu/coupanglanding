-- payment_mark_success RPC 보강 — 형제 failed tx 자동 finalize
--
-- 기존 동작:
--   - p_tx_id 의 status=success + 그 tx 의 next_retry_at=NULL
--   - 그 tx 의 monthly_report 를 paid 로 마킹
--
-- 보강 사유:
--   같은 monthly_report 에 대한 다른 failed tx 가 next_retry_at 살아있는 경우
--   payment_clear_overdue_if_settled 가 가드 A 에 걸려 false 반환 → 락이 안 풀린다.
--   (자동결제 실패 후 사용자가 재등록/수동결제로 새 tx 만들어 성공한 시나리오)
--
-- 추가 동작:
--   - 같은 monthly_report 의 다른 failed tx 들을 is_final_failure=true 로 마킹
--   - next_retry_at=NULL 로 클리어 → 가드 A 통과 가능
--
-- 안전: 같은 리포트의 다른 tx 만 만짐. 다른 리포트의 retry 는 보존.

CREATE OR REPLACE FUNCTION payment_mark_success(
  p_tx_id UUID,
  p_payment_key TEXT,
  p_receipt_url TEXT,
  p_raw JSONB,
  p_approved_at TIMESTAMPTZ
) RETURNS VOID AS $func$
DECLARE
  v_monthly_report_id UUID;
BEGIN
  -- Idempotency: already success -> no-op
  IF EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE id = p_tx_id AND status = 'success'
  ) THEN
    RETURN;
  END IF;

  -- Must be pending or failed to mark success
  IF NOT EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE id = p_tx_id AND status IN ('pending', 'failed')
  ) THEN
    RAISE EXCEPTION 'payment_mark_success: tx % not in pending/failed state', p_tx_id;
  END IF;

  -- Update tx row
  UPDATE payment_transactions
     SET status = 'success',
         toss_payment_key = p_payment_key,
         receipt_url = p_receipt_url,
         raw_response = p_raw,
         approved_at = p_approved_at,
         next_retry_at = NULL,
         is_final_failure = false,
         updated_at = now()
   WHERE id = p_tx_id
   RETURNING monthly_report_id INTO v_monthly_report_id;

  -- Update related monthly_report (join via payment_transactions)
  UPDATE monthly_reports
     SET payment_status = 'confirmed',
         payment_confirmed_at = now(),
         fee_payment_status = 'paid',
         fee_confirmed_at = now(),
         fee_paid_at = now()
   WHERE id = v_monthly_report_id;

  -- Update related billing_card (if any)
  UPDATE billing_cards AS bc
     SET last_used_at = now(),
         failed_count = 0
    FROM payment_transactions AS pt
   WHERE pt.id = p_tx_id
     AND pt.billing_card_id IS NOT NULL
     AND bc.id = pt.billing_card_id;

  -- ★ 신규: 같은 리포트의 형제 failed tx finalize
  --   동일 monthly_report 에 대한 다른 failed tx 들을 is_final_failure=true 로 마킹.
  --   next_retry_at=NULL 로 클리어해 payment_clear_overdue_if_settled 가드 A 통과 보장.
  UPDATE payment_transactions
     SET next_retry_at = NULL,
         is_final_failure = true,
         final_failed_at = COALESCE(final_failed_at, now()),
         failure_message = COALESCE(failure_message, '') ||
           ' [auto-finalized: superseded by tx ' || p_tx_id::text || ']'
   WHERE monthly_report_id = v_monthly_report_id
     AND id <> p_tx_id
     AND status = 'failed'
     AND is_final_failure = false;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION payment_mark_success(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_mark_success(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO service_role;
