-- 결제 락 사고 통합 정리 — 한 번에 안전하게 실행하는 스크립트
--
-- 순서:
--   1) 좀비 failed tx 정리 (가드 A 해제 조건 만족시키기)
--   2) 모든 PT 유저 대상으로 payment_clear_overdue_if_settled 재호출
--      → 가드 A/B 둘 다 통과하는 사용자의 락만 자동 해제
--      → 미납이 남았거나 admin_override_level 있는 사용자는 보존
--
-- 안전 체크:
--   - admin_override_level 셋된 사용자는 자동 클리어 RPC가 안 건드림 (보존됨)
--   - 미납 리포트 남은 사용자도 RPC가 false 반환하므로 보존됨
--
-- 실행 후 supabase/diagnostic_locked_users_breakdown.sql 로 잔존 락 확인 권장.

BEGIN;

-- ─── STEP 1: 좀비 failed tx finalize ─────────────────────────────
-- paid 리포트의 동기 failed tx 가 next_retry_at 살아있는 케이스 정리
UPDATE payment_transactions pt
SET
  next_retry_at = NULL,
  is_final_failure = true,
  final_failed_at = COALESCE(pt.final_failed_at, now()),
  failure_message = COALESCE(pt.failure_message, '') ||
    ' [zombie-cleanup: report=paid via different tx]'
FROM monthly_reports mr
WHERE mr.id = pt.monthly_report_id
  AND mr.fee_payment_status = 'paid'
  AND pt.status = 'failed'
  AND pt.is_final_failure = false
  AND pt.next_retry_at IS NOT NULL;

-- ─── STEP 2: 잠긴 모든 사용자 대상 조건부 클리어 RPC 재호출 ────────
-- 각 사용자별로 가드 A/B 통과 시에만 락 해제 (RPC 내부에서 판단)
DO $remediation$
DECLARE
  pu_row RECORD;
  cleared_count INT := 0;
  skipped_count INT := 0;
  result BOOLEAN;
BEGIN
  FOR pu_row IN
    SELECT id
    FROM pt_users
    WHERE admin_override_level IS NULL
      AND (payment_overdue_since IS NOT NULL OR payment_lock_level > 0)
  LOOP
    SELECT payment_clear_overdue_if_settled(pu_row.id) INTO result;
    IF result THEN
      cleared_count := cleared_count + 1;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '결제 락 정리 완료 — cleared=%, still_locked=% (admin_override 또는 미납 잔존)',
    cleared_count, skipped_count;
END;
$remediation$;

COMMIT;
