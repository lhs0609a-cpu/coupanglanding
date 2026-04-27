-- ============================================================
-- 매월 자동 monthly_reports 생성 + 사용자 확정 흐름 마이그레이션
-- ============================================================
-- 흐름:
--  1) 매월 1일 KST 03:00 cron 이 직전 달 monthly_reports row 자동 생성
--     (api_revenue_snapshots 기반, fee_payment_status='awaiting_review')
--  2) 사용자가 /my/report 에서 검토 후 "확인" 버튼 클릭
--     → RPC monthly_report_user_confirm 호출
--     → fee_payment_status: awaiting_review → awaiting_payment
--  3) 매월 5일 auto-billing cron 이 awaiting_payment / overdue / suspended 만 청구
--     → awaiting_review 는 청구 대상 아님 (사용자 미확인)
--  4) 미확인 시 fee_payment_check cron 이 마감일 후 알림 + 락 단계 시작
--
-- 안전 재실행 가능 (CREATE OR REPLACE / IF NOT EXISTS)
-- ============================================================

-- ============================================================
-- 1. monthly_report_user_confirm RPC
-- ------------------------------------------------------------
-- 사용자가 자동 생성된 보고서를 검토 후 확정할 때 호출.
-- 안전 가드:
--   - 본인 소유 row 만 가능 (auth.uid() == pt_user.profile_id)
--   - fee_payment_status가 'awaiting_review' 일 때만 전이
-- ============================================================

CREATE OR REPLACE FUNCTION monthly_report_user_confirm(p_report_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_profile_id UUID;
  v_current_status TEXT;
  v_pt_user_id UUID;
BEGIN
  -- 호출자 인증 확인
  v_user_profile_id := auth.uid();
  IF v_user_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '인증이 필요합니다.');
  END IF;

  -- 보고서 조회 + 본인 소유 검증
  SELECT mr.fee_payment_status, mr.pt_user_id
    INTO v_current_status, v_pt_user_id
  FROM monthly_reports mr
  JOIN pt_users pu ON pu.id = mr.pt_user_id
  WHERE mr.id = p_report_id
    AND pu.profile_id = v_user_profile_id;

  IF v_pt_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '보고서를 찾을 수 없거나 권한이 없습니다.');
  END IF;

  IF v_current_status <> 'awaiting_review' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '확정 가능한 상태가 아닙니다 (현재: ' || COALESCE(v_current_status, 'NULL') || ')'
    );
  END IF;

  -- 상태 전이
  UPDATE monthly_reports
    SET fee_payment_status = 'awaiting_payment',
        updated_at = now()
  WHERE id = p_report_id
    AND fee_payment_status = 'awaiting_review';

  RETURN jsonb_build_object('success', true, 'reportId', p_report_id);
END;
$$;

REVOKE ALL ON FUNCTION monthly_report_user_confirm(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monthly_report_user_confirm(UUID) TO authenticated;

-- ============================================================
-- 2. protect_paid_monthly_report trigger 보완 — awaiting_review 추가 처리
-- ------------------------------------------------------------
-- 기존 trigger는 paid 상태만 보호. awaiting_review 도 청구되면 안 되니
-- payment_status='auto_drafted' 인 row 가 사용자 확정 없이 awaiting_payment
-- 으로 가는 것은 RPC 만 허용 (직접 update 차단).
-- → 이건 protect_paid_monthly_report 기존 trigger 와는 별개로,
--   여기서는 추가 가드 안 함 (RPC 가 SECURITY DEFINER 라 신뢰 가능 + 자동 생성 cron
--   은 service_role 로 동작).
-- ============================================================

-- ============================================================
-- 3. 자동 생성된 보고서 인덱스 — cron이 누락 사용자 빨리 찾기 위함
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_monthly_reports_awaiting_review
  ON monthly_reports (pt_user_id, year_month)
  WHERE fee_payment_status = 'awaiting_review';
