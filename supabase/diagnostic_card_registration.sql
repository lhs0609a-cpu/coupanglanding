-- 카드 등록 무한 로딩 진단 — RPC + 컬럼 + 테이블 체크
-- Supabase SQL Editor에 그대로 붙여넣고 Run.

WITH expected_rpcs(name) AS (VALUES
  ('billing_card_register_primary'),
  ('payment_mark_success'),
  ('payment_clear_overdue_if_settled')
),
expected_columns(table_name, column_name) AS (VALUES
  ('pt_users','payment_overdue_since'),
  ('pt_users','payment_lock_level'),
  ('pt_users','payment_retry_in_progress'),
  ('payment_transactions','retry_count'),
  ('payment_transactions','next_retry_at'),
  ('payment_transactions','is_final_failure'),
  ('payment_transactions','final_failed_at'),
  ('payment_transactions','penalty_amount'),
  ('payment_transactions','total_amount'),
  ('payment_transactions','is_auto_payment'),
  ('billing_cards','customer_key'),
  ('billing_cards','billing_key'),
  ('billing_cards','is_primary')
),
expected_tables(name) AS (VALUES
  ('billing_cards'),
  ('payment_transactions'),
  ('payment_schedules'),
  ('monthly_reports')
),
missing_rpcs AS (
  SELECT 'A. 누락 RPC' AS section, e.name AS missing_item, NULL::TEXT AS detail
  FROM expected_rpcs e
  LEFT JOIN information_schema.routines r
    ON r.routine_name = e.name AND r.routine_schema = 'public'
  WHERE r.routine_name IS NULL
),
missing_columns AS (
  SELECT 'B. 누락 컬럼' AS section,
         e.table_name || '.' || e.column_name AS missing_item,
         NULL::TEXT AS detail
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_name = e.table_name
    AND c.column_name = e.column_name
    AND c.table_schema = 'public'
  WHERE c.column_name IS NULL
),
missing_tables AS (
  SELECT 'C. 누락 테이블' AS section, e.name AS missing_item, NULL::TEXT AS detail
  FROM expected_tables e
  LEFT JOIN information_schema.tables t
    ON t.table_name = e.name AND t.table_schema = 'public'
  WHERE t.table_name IS NULL
)
SELECT * FROM missing_rpcs
UNION ALL SELECT * FROM missing_columns
UNION ALL SELECT * FROM missing_tables
ORDER BY section, missing_item;
