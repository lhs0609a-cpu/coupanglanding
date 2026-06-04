-- ============================================================
-- 계약 약관 버전 관리 + 개정(v2) 재동의 추적
--   - terms_version: 서명 당시 약관 버전 (terms 스냅샷 기준)
--   - amendment_agreed_version / _at / _ip: 개정 약관 재동의 기록
-- 기존 서명자는 terms_version 기본값 1 → CONTRACT_TERMS_VERSION(=2) 보다 작아
-- 계약 페이지에서 재동의 요구 대상이 된다.
-- ============================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS terms_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amendment_agreed_version INTEGER,
  ADD COLUMN IF NOT EXISTS amendment_agreed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amendment_agreed_ip TEXT;

COMMENT ON COLUMN contracts.terms_version IS '서명 당시 약관 버전 (terms JSONB 스냅샷 기준)';
COMMENT ON COLUMN contracts.amendment_agreed_version IS '회원이 재동의한 최신 개정 약관 버전';
COMMENT ON COLUMN contracts.amendment_agreed_at IS '개정 약관 재동의 일시';
COMMENT ON COLUMN contracts.amendment_agreed_ip IS '개정 약관 재동의 시 클라이언트 IP';

-- 재동의 필요 대상 빠른 조회용
CREATE INDEX IF NOT EXISTS idx_contracts_amendment_pending
  ON contracts (terms_version, amendment_agreed_version)
  WHERE signed_at IS NOT NULL;

-- PostgREST 스키마 캐시 즉시 갱신
NOTIFY pgrst, 'reload schema';
