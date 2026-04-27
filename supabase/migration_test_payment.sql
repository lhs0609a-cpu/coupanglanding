-- ============================================================
-- 관리자 테스트 결제 지원 마이그레이션
-- ============================================================
-- 목적: /admin/payments/test 페이지에서 임의 PT 사용자 카드로 1~1000원
--      테스트 결제를 실행하기 위해 payment_transactions 스키마 완화.
--
-- 변경:
--   1) monthly_report_id NULL 허용 — 테스트 결제는 monthly_report와 무관
--   2) is_test_transaction BOOLEAN 컬럼 추가 — 테스트 트랜잭션 식별
--   3) test_initiated_by UUID 컬럼 추가 — 어느 admin이 실행했는지 감사 추적
--   4) test_note TEXT 컬럼 추가 — 테스트 메모
--
-- 안전:
--   - 기존 결제 흐름(/api/payments/execute, auto-billing 등)은 monthly_report_id를
--     계속 NOT NULL로 보내므로 영향 없음. NULL 허용은 신규 테스트 결제만 사용.
--   - is_test_transaction 기본값 false라 기존 row는 그대로 비테스트로 분류됨.

ALTER TABLE payment_transactions
  ALTER COLUMN monthly_report_id DROP NOT NULL;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS is_test_transaction BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS test_initiated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS test_note TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_is_test
  ON payment_transactions(is_test_transaction)
  WHERE is_test_transaction = true;
