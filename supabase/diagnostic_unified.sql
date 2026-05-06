-- 통합 진단 — 모든 섹션 한 번에 결과 표시 (UNION ALL).
-- Supabase SQL Editor 가 마지막 SELECT 만 보여주는 문제 회피.

WITH expected_tables(name) AS (VALUES
  ('billing_cards'),('payment_schedules'),('payment_settlement_errors'),('payment_transactions'),('tax_invoices'),
  ('ad_cost_submissions'),
  ('coupang_notice_category_cache'),('megaload_category_corrections'),
  ('megaload_users'),('megaload_sub_accounts'),('megaload_return_requests'),('channel_credentials'),
  ('sh_products'),('sh_product_options'),('sh_product_images'),('sh_product_channels'),
  ('sh_product_categories'),('sh_product_headers'),('sh_product_schedules'),('sh_product_templates'),
  ('sh_product_name_mappings'),
  ('sh_orders'),('sh_order_items'),('sh_order_memos'),('sh_order_tags'),('sh_order_gifts'),
  ('sh_inventory'),('sh_inventory_logs'),('sh_settlements'),('sh_daily_sales_stats'),
  ('sh_automation_rules'),('sh_automation_logs'),
  ('sh_sourcing_products'),('sh_sourcing_orders'),('sh_sourcing_sources'),('sh_sourcing_tracking'),
  ('sh_sourcing_wishlist'),('sh_sourcing_product_skus'),('sh_sourcing_price_config'),
  ('sh_sku_mappings'),('sh_replication_jobs'),
  ('sh_brand_protection_list'),('sh_category_mappings'),('sh_channel_margin_settings'),
  ('sh_courier_companies'),('sh_credits'),('sh_credit_logs'),
  ('sh_cs_inquiries'),('sh_cs_templates'),('sh_customs_duty_rates'),('sh_exchange_rates'),
  ('sh_gift_rules'),('sh_notifications'),('sh_stock_monitors'),('sh_stock_monitor_logs'),
  ('sh_sync_jobs'),('sh_api_call_logs'),('sh_bug_reports'),('sh_bug_report_messages'),
  ('penalty_records'),('penalty_summary'),('partner_violations'),
  ('violation_history'),('violation_summary'),
  ('trainers'),('trainer_earnings'),('trainer_messages'),('trainer_notes'),('trainer_trainees'),
  ('trending_keywords'),('keyword_trend_history'),
  ('faqs'),('notices'),('notice_reads'),
  ('manual_input_requests'),('pre_registrations'),
  ('stock_image_bank'),('brand_blacklist'),('cron_locks'),
  ('seller_achievements'),('seller_challenges'),('seller_challenge_progress'),
  ('seller_daily_activity'),('seller_points'),
  ('company_settings'),('screening_links'),('screening_results'),
  ('coupon_apply_log'),('coupon_auto_sync_config'),
  ('product_coupon_tracking'),('bulk_apply_progress'),
  ('api_revenue_snapshots'),('support_tickets'),('ticket_messages'),
  ('incidents')
),
expected_columns(table_name, column_name) AS (VALUES
  ('sh_sync_jobs','result'),
  ('channel_credentials','circuit_breaker_state'),
  ('channel_credentials','consecutive_failures'),
  ('pt_users','gemini_api_key'),
  ('pt_users','coupang_wing_user_id'),
  ('payment_transactions','retry_count'),
  ('payment_transactions','next_retry_at'),
  ('payment_transactions','is_final_failure'),
  ('pt_users','billing_excluded_until'),
  ('pt_users','billing_exclusion_reason'),
  ('pt_users','is_test_account'),
  ('payment_transactions','input_source')
),
expected_indexes(table_name, index_name) AS (VALUES
  ('megaload_category_corrections','idx_category_corrections_user_sig'),
  ('sh_bug_reports','idx_sh_bug_reports_user_status'),
  ('sh_bug_report_messages','idx_sh_bug_report_msgs_report'),
  ('coupang_notice_category_cache','idx_notice_cache_updated')
),
expected_funcs(name) AS (VALUES
  ('billing_exclude_user'),('billing_include_user'),
  ('get_billing_excluded_users'),('payment_retry_eligible_users')
),
missing_tables AS (
  SELECT 'A. 누락테이블' AS section, e.name AS missing_item, NULL::TEXT AS detail
  FROM expected_tables e
  LEFT JOIN information_schema.tables t
    ON t.table_name = e.name AND t.table_schema = 'public'
  WHERE t.table_name IS NULL
),
missing_columns AS (
  SELECT 'B. 누락컬럼' AS section,
         e.table_name || '.' || e.column_name AS missing_item,
         NULL::TEXT AS detail
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_name = e.table_name AND c.column_name = e.column_name AND c.table_schema = 'public'
  WHERE c.column_name IS NULL
),
image_check AS (
  SELECT 'C. image_type CHECK' AS section,
         cc.constraint_name AS missing_item,
         cc.check_clause AS detail
  FROM information_schema.check_constraints cc
  JOIN information_schema.constraint_column_usage ccu
    ON cc.constraint_name = ccu.constraint_name
  WHERE ccu.table_name = 'sh_product_images' AND ccu.column_name = 'image_type'
),
missing_indexes AS (
  SELECT 'E. 누락인덱스' AS section,
         e.table_name || '.' || e.index_name AS missing_item,
         NULL::TEXT AS detail
  FROM expected_indexes e
  LEFT JOIN pg_indexes p ON p.tablename = e.table_name AND p.indexname = e.index_name AND p.schemaname = 'public'
  WHERE p.indexname IS NULL
),
missing_funcs AS (
  SELECT 'F. 누락RPC' AS section, e.name AS missing_item, NULL::TEXT AS detail
  FROM expected_funcs e
  LEFT JOIN information_schema.routines r
    ON r.routine_name = e.name AND r.routine_schema = 'public'
  WHERE r.routine_name IS NULL
)
SELECT * FROM missing_tables
UNION ALL SELECT * FROM missing_columns
UNION ALL SELECT * FROM image_check
UNION ALL SELECT * FROM missing_indexes
UNION ALL SELECT * FROM missing_funcs
ORDER BY section, missing_item;
