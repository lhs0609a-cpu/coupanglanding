-- ============================================================
-- 결제 사이클 제외(billing exclusion) — 관리자 지정 면제 기능
-- ------------------------------------------------------------
-- 목적: 특정 PT생을 일시적으로 자동결제 사이클에서 빼고 다시 넣을 수 있게 함.
--   - 자동결제 cron 이 skip
--   - 보고서 자동 생성 cron 이 skip (결제 안 일어나니 보고서도 만들 필요 없음)
--   - 락 계산도 NORMAL 강제
--   - 관리자 UI 에서 종료일 지정 / 즉시 해제 가능
--
-- 기존 payment_lock_exempt_until 과의 차이:
--   payment_lock_exempt_until = 락만 면제 (결제는 시도)
--   billing_excluded_until    = 결제 자체를 시도하지 않음 (사이클 완전 제외)
-- ============================================================

-- billing_excluded_by_admin_id 는 FK 제약을 두지 않음.
-- 이유: pt_users.profile_id 가 이미 profiles 를 참조하고 있어서, 두 번째 FK 가
--   PostgREST 의 implicit join (profile:profiles(*)) 을 ambiguous 로 만든다.
--   감사 추적은 admin profile_id 만 저장해도 충분 (admin 계정은 거의 삭제되지 않음).
ALTER TABLE pt_users
  ADD COLUMN IF NOT EXISTS billing_excluded_until DATE,
  ADD COLUMN IF NOT EXISTS billing_exclusion_reason TEXT,
  ADD COLUMN IF NOT EXISTS billing_excluded_by_admin_id UUID,
  ADD COLUMN IF NOT EXISTS billing_excluded_at TIMESTAMPTZ;

-- 이미 FK 가 있다면 제거 (이전 버전 마이그레이션 실행 환경 호환)
ALTER TABLE pt_users
  DROP CONSTRAINT IF EXISTS pt_users_billing_excluded_by_admin_id_fkey;

-- 부분 인덱스 — cron 이 "현재 제외 중인 PT생"을 빠르게 필터링
CREATE INDEX IF NOT EXISTS idx_pt_users_billing_excluded
  ON pt_users (billing_excluded_until)
  WHERE billing_excluded_until IS NOT NULL;
