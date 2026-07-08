-- ============================================================
-- sh_stock_monitor_logs.notes 컬럼 추가
-- ------------------------------------------------------------
-- 엔진(stock-monitor-engine.ts: deactivateMonitor)이 로그 insert 시
-- notes 필드를 채우는데, 이 컬럼이 스키마에 정의되어 있지 않아
-- 쿠팡 상품 삭제/승인반려 감지 시 로그 insert 가 실패(PGRST204/컬럼없음)했다.
-- 사람이 읽는 사유 메모용 TEXT 컬럼을 추가해 해당 이벤트 로깅을 복구한다.
-- 멱등: IF NOT EXISTS.
-- ============================================================

ALTER TABLE sh_stock_monitor_logs
  ADD COLUMN IF NOT EXISTS notes TEXT;
