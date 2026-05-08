-- 좀비 failed tx 정리 — paid 리포트인데 같은 리포트의 다른 failed tx가 next_retry_at 살아있는 경우
--
-- 사고 모델:
--   1) 자동결제 실패 → tx_old: status=failed, next_retry_at=24h후, is_final_failure=false
--   2) 사용자가 카드 재등록/수동결제로 새 tx 생성 → tx_new: status=success
--   3) payment_mark_success 는 tx_new 만 success+next_retry_at=NULL 처리. tx_old 는 그대로.
--   4) 결과: monthly_report.fee_payment_status='paid' 인데 tx_old.next_retry_at 살아있음
--   5) payment_clear_overdue_if_settled 가 가드 A 에 걸려 false 반환 → 락 영구 유지
--
-- 안전: 리포트가 'paid' 인 경우만 대상. status='failed' 인 tx 만 만짐.
-- 영향: 좀비 tx 의 next_retry_at=NULL, is_final_failure=true, final_failed_at 세팅.
--       payment-retry 크론이 이걸 다시 잡지 않음.

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
  AND pt.next_retry_at IS NOT NULL
RETURNING pt.id AS tx_id, pt.pt_user_id, pt.monthly_report_id, mr.year_month;
