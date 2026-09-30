-- 대리등록분을 쿠팡에서 삭제한 사실을 기록한다 (2026-09-29).
--
-- 왜 status 를 'deleted' 로 바꾸지 않는가:
--   1) status CHECK 는 ('pending','registering','succeeded','failed') 만 허용한다.
--   2) 더 중요한 이유 — 'succeeded' 는 "등록에 성공했다" 는 과거 사실이고 그건 여전히 참이다.
--      중복 방지는 `status !== 'failed'` 로, 계정별 등록 수 집계는 `status === 'succeeded'` 로 판단한다.
--      status 를 바꾸면 계정 등록 수가 0 으로 보여 대량등록이 그 계정을 다시 채우려 든다.
--   그래서 사실(status)은 남기고, 삭제 시점만 따로 적는다.
--
-- 이 컬럼이 있으면 "장부에 succeeded 인데 쿠팡에는 없다" 를 DB 만 보고 구분할 수 있다.

ALTER TABLE catalog_registrations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN catalog_registrations.deleted_at IS
  '쿠팡에서 이 상품이 삭제된(또는 삭제를 확인한) 시각. NULL 이면 살아있다고 본 상태. status 는 등록 당시의 결과라 바꾸지 않는다.';

-- 살아있는 대리등록분만 빠르게 세기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_catalog_registrations_alive
  ON catalog_registrations(megaload_user_id, status)
  WHERE deleted_at IS NULL;
