-- 이영선 (sunkind0709@gmail.com) 좀비 락 즉시 해제
-- 원인: 결제 제외(billing_excluded_until) 설정했지만 cron/middleware가 다른 컬럼
--       (payment_lock_exempt_until) 체크해서 락 다시 걸림.
-- 코드는 ab999e7 이후 두 컬럼 모두 체크하도록 수정됨. 이건 즉시 정정용.

UPDATE pt_users
SET
  payment_lock_level = 0,
  payment_overdue_since = NULL,
  payment_retry_in_progress = false,
  program_access_active = true
WHERE id = (
  SELECT pu.id FROM pt_users pu
  JOIN profiles p ON p.id = pu.profile_id
  WHERE p.email = 'sunkind0709@gmail.com'
)
  AND admin_override_level IS NULL
  -- 결제 제외 활성 상태인지 확인 (안전장치)
  AND billing_excluded_until > CURRENT_DATE
RETURNING id, payment_lock_level, billing_excluded_until, payment_overdue_since;
