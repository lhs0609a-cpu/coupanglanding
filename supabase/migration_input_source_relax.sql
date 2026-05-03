-- ============================================================
-- monthly_reports.input_source CHECK 제약 완화
-- ------------------------------------------------------------
-- 문제: input_source 컬럼에 CHECK 제약이 있어 admin 트리거 endpoint 의
--       INSERT 가 거부됨 ("admin_charge_now" 등 새 값 차단).
--       → 보고서 생성 자체가 실패 → 결제 진행 불가.
--
-- 해결: 추적용 메타데이터 컬럼이라 회계 무결성에 critical 하지 않으므로
--       CHECK 제약 자체를 제거. 어떤 값이든 입력 가능.
-- ============================================================

ALTER TABLE monthly_reports
  DROP CONSTRAINT IF EXISTS monthly_reports_input_source_check;

-- 안전: 누군가 잘못된 값을 빈번히 넣지 못하도록 길이만 제한
ALTER TABLE monthly_reports
  DROP CONSTRAINT IF EXISTS monthly_reports_input_source_length;

ALTER TABLE monthly_reports
  ADD CONSTRAINT monthly_reports_input_source_length
  CHECK (input_source IS NULL OR length(input_source) <= 50);

NOTIFY pgrst, 'reload schema';
