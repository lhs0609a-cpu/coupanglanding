-- =============================================================
-- Payment RLS INSERT Policy Tightening
-- 2026-04: monthly_reports INSERT/DELETE 에도 UPDATE 와 동일한 제약 적용.
--
-- 배경:
--   migration_payment_hardening.sql 에서 UPDATE 정책(monthly_reports_update_own)
--   에는 payment_status='confirmed' / fee_payment_status='paid' 자기 승격 차단
--   WITH CHECK 를 걸었음. 그러나 원본 "PT users can manage own reports" 정책은
--   여전히 FOR ALL(WITH CHECK 없음) 이라 end-user 가 INSERT 시 자기 결제를
--   'paid' 상태로 넣을 수 있는 구멍이 남아있었다.
--
-- 전략:
--   1) 기존 FOR ALL end-user 정책을 SELECT/INSERT/DELETE 로 분리.
--   2) INSERT 에도 UPDATE 와 동일한 제약 WITH CHECK 적용 — 비관리자는
--      payment_status='confirmed' / fee_payment_status='paid' 로 INSERT 불가.
--   3) Admin FOR ALL 정책은 그대로 유지 (관리자는 모든 상태 조작 허용).
--
-- Safe to re-run (DROP IF EXISTS / CREATE).
-- =============================================================

-- 기존 느슨한 FOR ALL end-user 정책 제거
DROP POLICY IF EXISTS "PT users can manage own reports" ON monthly_reports;
DROP POLICY IF EXISTS monthly_reports_select_own ON monthly_reports;
DROP POLICY IF EXISTS monthly_reports_insert_own ON monthly_reports;
DROP POLICY IF EXISTS monthly_reports_delete_own ON monthly_reports;

-- SELECT: 본인 또는 admin
CREATE POLICY monthly_reports_select_own ON monthly_reports
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT: 본인이거나 admin. end-user 는 payment/fee 확정 상태로 생성 불가.
CREATE POLICY monthly_reports_insert_own ON monthly_reports
  FOR INSERT WITH CHECK (
    (
      pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR (
        payment_status <> 'confirmed'
        AND fee_payment_status <> 'paid'
      )
    )
  );

-- DELETE: 본인 또는 admin (기존 동작 유지, USING 만으로 충분)
CREATE POLICY monthly_reports_delete_own ON monthly_reports
  FOR DELETE USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- UPDATE 는 migration_payment_hardening.sql 의 monthly_reports_update_own 이
-- 이미 WITH CHECK 제약을 걸어 두었으므로 여기서 재정의하지 않는다.
