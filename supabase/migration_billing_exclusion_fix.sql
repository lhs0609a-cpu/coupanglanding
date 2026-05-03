-- ============================================================
-- 긴급 FIX — billing_excluded_by_admin_id 의 FK 제약 제거
-- ------------------------------------------------------------
-- 문제: migration_billing_exclusion.sql 에서 추가한
--   billing_excluded_by_admin_id UUID REFERENCES profiles(id)
-- 가 pt_users → profiles 관계를 2개로 만들어서
-- PostgREST 의 implicit join (profile:profiles(*)) 이 ambiguous 에러로 실패.
--
-- 해결: FK 제약만 제거. 컬럼과 데이터는 그대로 유지.
-- 감사 추적은 admin_id 만 저장해도 충분 (admin 계정은 잘 삭제되지 않음).
-- ============================================================

ALTER TABLE pt_users
  DROP CONSTRAINT IF EXISTS pt_users_billing_excluded_by_admin_id_fkey;
