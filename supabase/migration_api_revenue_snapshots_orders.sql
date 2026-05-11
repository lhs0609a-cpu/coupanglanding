-- api_revenue_snapshots 에 ordersheets(주문 기준) 매출 컬럼 추가.
-- 배경: 기존 total_sales 는 revenue-history(정산 인식) 기준이라 신규 셀러는 정산 지연으로 0 표시.
-- ordersheets 는 주문 발생 즉시 집계되므로 신규 셀러 매출 누락을 막을 수 있다.
--
-- 운영 방침:
--   total_sales         = 정산 기준 (확정된 정산 금액의 베이스)
--   total_sales_orders  = 주문 기준 (정산 전이라도 발생한 주문 합산)
--   표시 매출           = GREATEST(total_sales, total_sales_orders)
--                         → 정산 완료된 건 정산값, 정산 안 된 신규 셀러는 주문값

ALTER TABLE api_revenue_snapshots
  ADD COLUMN IF NOT EXISTS total_sales_orders NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_count_orders INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_sync_error TEXT;

COMMENT ON COLUMN api_revenue_snapshots.total_sales IS 'revenue-history(정산 인식) 기준 매출 — 발송완료 후 ~15일 지연';
COMMENT ON COLUMN api_revenue_snapshots.total_sales_orders IS 'ordersheets(주문) 기준 매출 — 주문 발생 즉시 반영 (신규 셀러 정산 지연 대응)';
COMMENT ON COLUMN api_revenue_snapshots.item_count_orders IS 'ordersheets 기준 item 수';
COMMENT ON COLUMN api_revenue_snapshots.order_count IS 'ordersheets 기준 unique 주문 수';
COMMENT ON COLUMN api_revenue_snapshots.orders_sync_error IS 'ordersheets API 호출 실패 메시지 (settlement과 독립)';

NOTIFY pgrst, 'reload schema';
