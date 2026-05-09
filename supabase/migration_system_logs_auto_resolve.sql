-- ============================================================
-- system_logs — source 단위 자동 해결 (이벤트 기반)
--
-- 호출자: 라우트가 "완전 성공" 상태에 도달했을 때 호출.
--   예) cron/coupang-revenue-sync 가 totalFailed === 0 일 때
--   예) shipping-info 가 outbound + return 둘 다 성공일 때
--
-- 동작: 해당 source 의 모든 미해결 row 를 resolved=true 로 마킹.
--       resolved_by = NULL (자동), resolved_note = 'auto:source-success'.
--       반환: 마킹된 row 개수.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_system_logs_by_source(p_source TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE system_logs
  SET resolved = true,
      resolved_at = now(),
      resolved_by = NULL,
      resolved_note = 'auto:source-success'
  WHERE source = p_source
    AND resolved = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION resolve_system_logs_by_source TO authenticated, service_role;
