-- =============================================================
-- Payment System Hardening Migration
-- 2026-04 audit: critical vulnerability fixes
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS used).
-- =============================================================


-- Section 1: toss_order_id UNIQUE
-- Prevents duplicate charges when auto-billing / retry / manual
-- execute run concurrently for the same order.

ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_toss_order_id_key;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_toss_order_id_key
  UNIQUE (toss_order_id);


-- Section 2: one pending tx per monthly_report at a time
-- (history preserved; only pending is constrained)

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tx_pending_per_report
  ON payment_transactions (monthly_report_id)
  WHERE status = 'pending';


-- Section 3: status value CHECK to prevent typos

ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'cancelled'));


-- Section 4: billing_cards RLS hardening
-- Add WITH CHECK so users cannot update row into a different owner.
-- Revoke UPDATE on sensitive columns from end users (service role bypasses).

DROP POLICY IF EXISTS billing_cards_update_own ON billing_cards;

CREATE POLICY billing_cards_update_own ON billing_cards
  FOR UPDATE
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

REVOKE UPDATE (billing_key, customer_key, card_company, card_number, card_type)
  ON billing_cards FROM authenticated, anon;

GRANT UPDATE (is_primary, is_active) ON billing_cards TO authenticated;


-- Section 5: revenue_entries dedup via source_ref

ALTER TABLE revenue_entries
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_entries_source
  ON revenue_entries (year_month, source, source_ref)
  WHERE source_ref IS NOT NULL;


-- Section 6: settlement error log table
-- Replaces silent catch blocks. Admin can inspect.

CREATE TABLE IF NOT EXISTS payment_settlement_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_report_id UUID REFERENCES monthly_reports(id) ON DELETE CASCADE,
  pt_user_id UUID REFERENCES pt_users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlement_errors_unresolved
  ON payment_settlement_errors (created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE payment_settlement_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_errors_admin ON payment_settlement_errors;

CREATE POLICY settlement_errors_admin ON payment_settlement_errors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- Section 7: atomic payment success RPC
-- Bundles payment_transactions + monthly_reports + billing_cards into one
-- transaction. Idempotent: re-call on an already-success tx is a no-op.

CREATE OR REPLACE FUNCTION payment_mark_success(
  p_tx_id UUID,
  p_payment_key TEXT,
  p_receipt_url TEXT,
  p_raw JSONB,
  p_approved_at TIMESTAMPTZ
) RETURNS VOID AS $func$
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
   WHERE id = p_tx_id;

  -- Update related monthly_report (join via payment_transactions)
  UPDATE monthly_reports AS mr
     SET payment_status = 'confirmed',
         payment_confirmed_at = now(),
         fee_payment_status = 'paid',
         fee_confirmed_at = now(),
         fee_paid_at = now()
    FROM payment_transactions AS pt
   WHERE pt.id = p_tx_id
     AND mr.id = pt.monthly_report_id;

  -- Update related billing_card (if any)
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


-- Section 8: conditional overdue clear RPC
-- Only releases lock if no other unpaid report or pending retry exists.

CREATE OR REPLACE FUNCTION payment_clear_overdue_if_settled(
  p_pt_user_id UUID
) RETURNS BOOLEAN AS $func$
BEGIN
  -- Bail out if any pending retry exists
  IF EXISTS (
    SELECT 1 FROM payment_transactions
     WHERE pt_user_id = p_pt_user_id
       AND status = 'failed'
       AND is_final_failure = false
       AND next_retry_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  -- Bail out if any unpaid report exists
  IF EXISTS (
    SELECT 1 FROM monthly_reports
     WHERE pt_user_id = p_pt_user_id
       AND fee_payment_status IN ('awaiting_payment', 'overdue', 'suspended')
  ) THEN
    RETURN false;
  END IF;

  -- Safe to clear lock
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


-- Section 9: advisory lock helpers for cron concurrency control

CREATE OR REPLACE FUNCTION payment_try_advisory_lock(p_key BIGINT)
RETURNS BOOLEAN AS $func$
BEGIN
  RETURN pg_try_advisory_lock(p_key);
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION payment_advisory_unlock(p_key BIGINT)
RETURNS BOOLEAN AS $func$
BEGIN
  RETURN pg_advisory_unlock(p_key);
END;
$func$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION payment_try_advisory_lock(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION payment_advisory_unlock(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_try_advisory_lock(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION payment_advisory_unlock(BIGINT) TO service_role;


-- Section 10: overview query acceleration

CREATE INDEX IF NOT EXISTS idx_pt_users_overdue
  ON pt_users (payment_overdue_since)
  WHERE payment_overdue_since IS NOT NULL;


-- Section 11: prevent users from self-confirming payment status
--
-- Strategy: RLS WITH CHECK blocks the specific dangerous transitions
-- (payment_status='confirmed', fee_payment_status='paid') for end users.
-- All other fields remain writable so the existing submit/deposit flow works.
-- Admin role and service_role bypass via existing admin policies.

ALTER TABLE monthly_reports
  DROP CONSTRAINT IF EXISTS monthly_reports_payment_status_check;

ALTER TABLE monthly_reports
  ADD CONSTRAINT monthly_reports_payment_status_check
  CHECK (payment_status IN (
    'draft', 'submitted', 'reviewed', 'deposited', 'confirmed', 'rejected'
  ));

ALTER TABLE monthly_reports
  DROP CONSTRAINT IF EXISTS monthly_reports_fee_payment_status_check;

ALTER TABLE monthly_reports
  ADD CONSTRAINT monthly_reports_fee_payment_status_check
  CHECK (fee_payment_status IN (
    'not_applicable', 'awaiting_payment', 'paid', 'overdue', 'suspended'
  ));

-- Drop any existing user-update policy and re-create with WITH CHECK.
-- Note: this assumes a policy named monthly_reports_update_own exists.
-- If your policy has a different name, adjust accordingly.

DROP POLICY IF EXISTS monthly_reports_update_own ON monthly_reports;

CREATE POLICY monthly_reports_update_own ON monthly_reports
  FOR UPDATE
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    -- Owner check
    (
      pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    -- End users (non-admin) cannot self-confirm.
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR (
        payment_status <> 'confirmed'
        AND fee_payment_status <> 'paid'
      )
    )
  );

-- User-triggered 'submitted -> deposited' transition must go through a
-- dedicated RPC so we can validate state machine rules server-side.

CREATE OR REPLACE FUNCTION monthly_report_mark_deposited(
  p_report_id UUID
) RETURNS VOID AS $func$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM monthly_reports mr
      JOIN pt_users pu ON pu.id = mr.pt_user_id
     WHERE mr.id = p_report_id
       AND pu.profile_id = auth.uid()
       AND mr.payment_status = 'reviewed'
  ) THEN
    RAISE EXCEPTION 'monthly_report_mark_deposited: not allowed';
  END IF;

  UPDATE monthly_reports
     SET payment_status = 'deposited',
         deposited_at = now()
   WHERE id = p_report_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION monthly_report_mark_deposited(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monthly_report_mark_deposited(UUID) TO authenticated;
