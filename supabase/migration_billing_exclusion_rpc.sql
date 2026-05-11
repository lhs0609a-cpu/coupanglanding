-- ============================================================
-- 결제 사이클 제외 RPC 함수 — REST update hang 회피
-- ------------------------------------------------------------
-- 문제: Supabase REST 의 .from('pt_users').update({...}) 가
--   schema cache / RLS / quota 등으로 hang 하는 경우가 발생.
-- 해결: Postgres function 안에서 직접 UPDATE 실행. 한 번의 RPC 콜로
--   원자적 처리. PostgREST schema cache 영향 받지 않음.
-- ============================================================

-- ---- set_billing_exclusion: 결제 제외 설정 ----
CREATE OR REPLACE FUNCTION set_billing_exclusion(
  p_pt_user_id UUID,
  p_excluded_until DATE,
  p_reason TEXT,
  p_admin_id UUID
) RETURNS pt_users AS $func$
DECLARE
  v_row pt_users;
BEGIN
  UPDATE pt_users
     SET billing_excluded_until = p_excluded_until,
         billing_exclusion_reason = p_reason,
         billing_excluded_by_admin_id = p_admin_id,
         billing_excluded_at = now(),
         payment_overdue_since = NULL,
         payment_lock_level = 0,
         admin_override_level = NULL,
         payment_retry_in_progress = false,
         program_access_active = true
   WHERE id = p_pt_user_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'pt_user_id % 를 찾을 수 없습니다', p_pt_user_id;
  END IF;

  RETURN v_row;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION set_billing_exclusion(UUID, DATE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_billing_exclusion(UUID, DATE, TEXT, UUID) TO service_role;


-- ---- clear_billing_exclusion: 결제 제외 해제 ----
CREATE OR REPLACE FUNCTION clear_billing_exclusion(
  p_pt_user_id UUID
) RETURNS pt_users AS $func$
DECLARE
  v_row pt_users;
BEGIN
  UPDATE pt_users
     SET billing_excluded_until = NULL,
         billing_exclusion_reason = NULL,
         billing_excluded_by_admin_id = NULL,
         billing_excluded_at = NULL
   WHERE id = p_pt_user_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'pt_user_id % 를 찾을 수 없습니다', p_pt_user_id;
  END IF;

  RETURN v_row;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION clear_billing_exclusion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_billing_exclusion(UUID) TO service_role;


-- ---- PostgREST schema cache 강제 갱신 ----
NOTIFY pgrst, 'reload schema';
