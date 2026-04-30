-- 쿠팡 WING 로그인 ID 컬럼 추가
-- 다운로드 쿠폰 생성/아이템 추가 API의 userId 필드(공식 스펙: "WING 로그인 ID")로 사용.
-- vendorId(업체코드)와 다른 별도 값. 응답 Example에서 vendorId와 lastModifiedBy가
-- 다른 필드로 동시 등장하는 것이 증거.
--
-- PT생마다 본인의 WING 로그인 ID를 저장해야 멀티 테넌트 환경에서
-- 다른 PT생의 쿠폰이 사장님 계정으로 등록되는 사고를 막을 수 있음.

ALTER TABLE pt_users
ADD COLUMN IF NOT EXISTS coupang_wing_user_id TEXT;

COMMENT ON COLUMN pt_users.coupang_wing_user_id IS
  '쿠팡 WING 로그인 ID (다운로드 쿠폰 API userId 필드). vendorId와 다른 값.';
