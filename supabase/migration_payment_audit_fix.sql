-- ============================================================
-- 결제 시스템 감사 수정 마이그레이션
-- 2026-04 audit 결과 4건 수정
-- 안전 재실행 가능 (IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- ============================================================
-- Fix #2: monthly_report_id NULL 우회 차단
-- ------------------------------------------------------------
-- 기존 unique index `uq_payment_tx_pending_per_report`는
-- monthly_report_id가 NULL인 행을 무제한 허용 (Postgres NULL ≠ NULL).
-- 테스트 결제 도입으로 NULL이 정상화되면서 동일 사용자에 동시 다수 pending 가능.
-- 수정: NOT NULL 행에만 unique 적용 + 테스트 결제는 별도 제약 (#1과 함께 advisory lock 사용).
-- ============================================================

DROP INDEX IF EXISTS uq_payment_tx_pending_per_report;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tx_pending_per_report
  ON payment_transactions (monthly_report_id)
  WHERE status = 'pending' AND monthly_report_id IS NOT NULL;

-- ============================================================
-- Fix #4: 한 사용자당 활성 primary 카드 1개만 허용
-- ------------------------------------------------------------
-- billing-key/issue 흐름에서 신규 카드 is_primary=true 후 기존 primary 해제.
-- 두 번째 update 실패 시 multiple primary 가능.
-- 수정: partial unique index로 DB 차원에서 강제.
--
-- 사전 cleanup: 이미 multiple primary 가 있으면 가장 최근 등록된 1장만 유지.
-- ============================================================

-- 기존에 같은 사용자에 primary=true가 2개 이상이면 가장 최근 것만 살림
WITH dups AS (
  SELECT id, pt_user_id, registered_at,
         row_number() OVER (
           PARTITION BY pt_user_id
           ORDER BY registered_at DESC, id DESC
         ) AS rn
  FROM billing_cards
  WHERE is_primary = true AND is_active = true
)
UPDATE billing_cards
SET is_primary = false
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_cards_primary_per_user
  ON billing_cards (pt_user_id)
  WHERE is_primary = true AND is_active = true;

-- ============================================================
-- 테스트 결제 advisory lock — admin별 동시 1건만 처리되게 코드에서 사용.
-- (정의 자체는 SQL 변경 없음. payment_try_advisory_lock RPC 재사용)
-- 여기서는 단지 메모용 주석.
-- ============================================================
