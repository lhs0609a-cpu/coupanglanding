-- ============================================================
-- sh_stock_monitor_logs.event_type CHECK 제약 확장
-- ------------------------------------------------------------
-- 실측 라벨 교정(reconcile-coupang) 이벤트 'coupang_reconcile' 추가.
-- 더불어 코드가 이미 쓰고 있으나 제약에 누락돼 insert 가 조용히 실패하던
-- 'desktop_check','manual_resume' 도 함께 허용값에 포함해 로깅을 복구한다.
-- 멱등: DROP IF EXISTS 후 재생성.
-- ============================================================

ALTER TABLE sh_stock_monitor_logs
  DROP CONSTRAINT IF EXISTS sh_stock_monitor_logs_event_type_check;

ALTER TABLE sh_stock_monitor_logs
  ADD CONSTRAINT sh_stock_monitor_logs_event_type_check
  CHECK (event_type IN (
    'source_sold_out','source_restocked','source_removed',
    'coupang_suspended','coupang_resumed','coupang_reconcile',
    'check_error','check_ok','desktop_check','manual_resume',
    'price_changed_source','price_updated_coupang',
    'price_update_skipped','price_update_flagged',
    'price_update_failed','price_update_pending',
    'price_approved','price_rejected'
  ));
