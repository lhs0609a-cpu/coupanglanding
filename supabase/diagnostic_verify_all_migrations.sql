-- ============================================================
-- 마이그레이션 일괄 검증 진단 SQL
--
-- 목적: 78개 migration_*.sql 중 production DB에 미적용된 항목 식별.
-- 작동: 모든 SELECT 만 (DDL/DML 없음). 안전.
-- 사용: Supabase SQL Editor 에 그대로 붙여넣고 Run.
--       각 섹션 결과를 보면 어떤 항목이 빠졌는지 즉시 파악.
-- ============================================================

-- ─── A. 기대되는 테이블 vs 실제 테이블 ───────────────────────
-- 결과: 누락된 테이블 목록.
WITH expected(name) AS (VALUES
  -- 결제/정산
  ('billing_cards'),('payment_schedules'),('payment_settlement_errors'),
  ('payment_transactions'),('tax_invoices'),
  -- 광고/비용
  ('ad_cost_submissions'),('cost_settings'),
  -- 카테고리/매칭
  ('coupang_notice_category_cache'),('megaload_category_corrections'),
  -- 메가로드 핵심
  ('megaload_users'),('megaload_sub_accounts'),('megaload_return_requests'),
  ('channel_credentials'),
  -- 메가로드 상품/주문/재고
  ('sh_products'),('sh_product_options'),('sh_product_images'),
  ('sh_product_channels'),('sh_product_categories'),('sh_product_headers'),
  ('sh_product_schedules'),('sh_product_templates'),('sh_product_name_mappings'),
  ('sh_orders'),('sh_order_items'),('sh_order_memos'),('sh_order_tags'),
  ('sh_order_gifts'),('sh_inventory'),('sh_inventory_logs'),
  ('sh_settlements'),('sh_daily_sales_stats'),
  -- 메가로드 자동화/소싱
  ('sh_automation_rules'),('sh_automation_logs'),
  ('sh_sourcing_products'),('sh_sourcing_orders'),('sh_sourcing_sources'),
  ('sh_sourcing_tracking'),('sh_sourcing_wishlist'),
  ('sh_sourcing_product_skus'),('sh_sourcing_price_config'),
  ('sh_sku_mappings'),
  ('sh_replication_jobs'),
  -- 메가로드 보조
  ('sh_brand_protection_list'),('sh_category_mappings'),
  ('sh_channel_margin_settings'),('sh_courier_companies'),
  ('sh_credits'),('sh_credit_logs'),
  ('sh_cs_inquiries'),('sh_cs_templates'),
  ('sh_customs_duty_rates'),('sh_exchange_rates'),
  ('sh_gift_rules'),('sh_notifications'),
  ('sh_stock_monitors'),('sh_stock_monitor_logs'),
  ('sh_sync_jobs'),('sh_api_call_logs'),
  ('sh_bug_reports'),('sh_bug_report_messages'),
  -- 오류문의
  ('incidents'),('partner_violations'),
  ('penalty_records'),('penalty_summary'),
  ('violation_history'),('violation_summary'),
  -- 트레이너/PT
  ('trainers'),('trainer_earnings'),('trainer_messages'),
  ('trainer_notes'),('trainer_trainees'),
  -- 트렌드/키워드
  ('trending_keywords'),('keyword_trend_history'),
  -- 화면설정/온보딩
  ('faqs'),('notices'),('notice_reads'),
  ('manual_input_requests'),('pre_registrations'),
  -- 미디어/이미지
  ('stock_image_bank'),('brand_blacklist'),
  -- 정기진행
  ('cron_locks'),
  -- 게이미피케이션
  ('seller_achievements'),('seller_challenges'),('seller_challenge_progress'),
  ('seller_daily_activity'),('seller_points'),
  -- 회사 설정
  ('company_settings'),
  -- 스크리닝
  ('screening_links'),('screening_results'),
  -- 쿠폰
  ('coupon_apply_log'),('coupon_auto_sync_config'),
  ('product_coupon_tracking'),('bulk_apply_progress'),
  -- 메가로드 prefix
  ('api_revenue_snapshots'),
  -- 지원
  ('support_tickets'),('ticket_messages')
),
actual AS (
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
)
SELECT '[A] 누락 테이블' AS section, e.name AS missing
FROM expected e
LEFT JOIN actual a ON a.table_name = e.name
WHERE a.table_name IS NULL
ORDER BY e.name;

-- ─── B. 핵심 컬럼 누락 체크 ────────────────────────────────
-- 최근 마이그레이션이 추가한 컬럼이 실제로 존재하는지.
WITH expected(table_name, column_name, source_migration) AS (VALUES
  -- bulk_register_v2: result 컬럼 (방금 추가한 것)
  ('sh_sync_jobs','result','migration_bulk_register_v2'),
  -- coupang_circuit_breaker
  ('channel_credentials','circuit_breaker_state','migration_coupang_circuit_breaker'),
  ('channel_credentials','circuit_opened_at','migration_coupang_circuit_breaker'),
  ('channel_credentials','consecutive_failures','migration_coupang_circuit_breaker'),
  -- gemini api key
  ('pt_users','gemini_api_key','migration_gemini_api_key'),
  -- coupang wing user id
  ('pt_users','coupang_wing_user_id','migration_coupang_wing_user_id'),
  -- promotion v2
  ('product_coupon_tracking','vendor_item_id','migration_promotion_vendor_item'),
  -- payment retry
  ('payment_transactions','retry_count','migration_payment_retry'),
  ('payment_transactions','next_retry_at','migration_payment_retry'),
  ('payment_transactions','is_final_failure','migration_payment_retry'),
  -- billing exclusion
  ('pt_users','billing_excluded_until','migration_billing_exclusion'),
  ('pt_users','billing_exclusion_reason','migration_billing_exclusion'),
  -- test account
  ('pt_users','is_test_account','migration_test_account_flag'),
  -- contract termination
  ('contracts','terminated_at','migration_contract_termination'),
  -- triple contract
  ('contracts','contract_number','migration_triple_contract'),
  -- vat tax invoice
  ('tax_invoices','vat_amount','migration_vat_tax_invoice'),
  -- monthly report auto
  ('monthly_reports','auto_created','migration_auto_monthly_report'),
  -- payment correctness
  ('payment_transactions','input_source','migration_payment_correctness'),
  -- input source relax
  ('payment_transactions','input_source','migration_input_source_relax')
),
actual AS (
  SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
)
SELECT '[B] 누락 컬럼' AS section,
       e.table_name || '.' || e.column_name AS missing_column,
       e.source_migration AS likely_source
FROM expected e
LEFT JOIN actual a ON a.table_name = e.table_name AND a.column_name = e.column_name
WHERE a.column_name IS NULL
ORDER BY e.source_migration, e.table_name, e.column_name;

-- ─── C. 핵심 CHECK 제약 검증 ─────────────────────────────────
-- bulk_register_v2 CHECK: image_type 6 종류 허용 확인
SELECT '[C] image_type CHECK' AS section,
       cc.constraint_name,
       cc.check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.constraint_column_usage ccu
  ON cc.constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'sh_product_images'
  AND ccu.column_name = 'image_type';

-- ─── D. 핵심 RLS 정책 존재 ──────────────────────────────────
SELECT '[D] RLS 정책 수' AS section,
       schemaname || '.' || tablename AS table_name,
       COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename IN (
  'sh_products','sh_orders','megaload_users','channel_credentials',
  'megaload_category_corrections','sh_bug_reports',
  'pt_users','payment_transactions'
)
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ─── E. 누락된 인덱스 (key index 만 확인) ──────────────────
WITH expected_indexes(table_name, index_pattern) AS (VALUES
  ('megaload_category_corrections','idx_category_corrections_user_sig'),
  ('sh_bug_reports','idx_sh_bug_reports_user_status'),
  ('sh_bug_report_messages','idx_sh_bug_report_msgs_report'),
  ('sh_replication_jobs','idx_sh_replication_jobs_status'),
  ('sh_stock_monitors','idx_sh_stock_monitors_user'),
  ('payment_transactions','idx_payment_transactions_user'),
  ('coupang_notice_category_cache','idx_notice_cache_updated')
),
actual AS (
  SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'
)
SELECT '[E] 누락 인덱스' AS section,
       e.table_name || '.' || e.index_pattern AS missing_index
FROM expected_indexes e
LEFT JOIN actual a ON a.tablename = e.table_name AND a.indexname = e.index_pattern
WHERE a.indexname IS NULL;

-- ─── F. 함수/RPC 존재 확인 ──────────────────────────────────
WITH expected_funcs(name) AS (VALUES
  ('billing_exclude_user'),
  ('billing_include_user'),
  ('get_billing_excluded_users'),
  ('payment_retry_eligible_users')
)
SELECT '[F] 누락 RPC 함수' AS section,
       e.name AS missing_function
FROM expected_funcs e
LEFT JOIN information_schema.routines r ON r.routine_name = e.name AND r.routine_schema = 'public'
WHERE r.routine_name IS NULL;
