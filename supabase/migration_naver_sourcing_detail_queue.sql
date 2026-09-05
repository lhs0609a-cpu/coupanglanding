-- 상세 추출 요청 큐
-- ---------------------------------------------------------------------------
-- 왜 필요한가: 셀러가 카탈로그에서 상품을 골랐는데 상세(옵션·상세글·고시정보)가 없으면
-- 지금은 그냥 "안 됩니다"로 끝난다. 셀러는 왜 어떤 건 되고 어떤 건 안 되는지 알 수 없고,
-- 할 수 있는 일도 없다.
--
-- 그렇다고 셀러 PC 가 직접 네이버를 열게 하면 안 된다 — 셀러마다 네이버 로그인이 필요하고,
-- 캡차·429 차단을 각자 겪는다(2026-08-18 관리자 PC 에서 하루 종일 겪은 그것이다). 셀러 IP 가
-- 막히면 그 사람은 아무것도 못 한다.
--
-- 그래서 **요청만 남기고 실제 추출은 관리자 도우미가 대신** 한다. 네이버를 두드리는 IP 는
-- 계속 하나뿐이고, 셀러는 기다리기만 하면 된다.

-- 기존 CHECK 는 ('none','done','failed') 뿐이라 요청 상태가 들어갈 자리가 없다.
ALTER TABLE sh_naver_sourcing_products
  DROP CONSTRAINT IF EXISTS sh_naver_sourcing_products_detail_status_check;

ALTER TABLE sh_naver_sourcing_products
  ADD CONSTRAINT sh_naver_sourcing_products_detail_status_check
  CHECK (detail_status IN ('none', 'requested', 'running', 'done', 'failed'));

-- 누가 언제 요청했나 — 요청이 오래 밀리면 그 사실이 보여야 한다.
ALTER TABLE sh_naver_sourcing_products
  ADD COLUMN IF NOT EXISTS detail_requested_at TIMESTAMPTZ;
ALTER TABLE sh_naver_sourcing_products
  ADD COLUMN IF NOT EXISTS detail_requested_by UUID REFERENCES megaload_users(id) ON DELETE SET NULL;
-- 몇 명이 이 상품을 기다리는가 — 여러 셀러가 같은 상품을 원하면 그게 우선순위다.
ALTER TABLE sh_naver_sourcing_products
  ADD COLUMN IF NOT EXISTS detail_request_count INTEGER NOT NULL DEFAULT 0;

-- 도우미가 "다음에 뭘 뽑을지" 고르는 질의를 위한 인덱스.
--   요청된 것 우선(요청 많은 순 → 오래 기다린 순), 그 다음이 미수집분.
CREATE INDEX IF NOT EXISTS idx_naver_sourcing_queue
  ON sh_naver_sourcing_products(detail_status, detail_request_count DESC, detail_requested_at);

-- 셀러도 **요청은** 할 수 있어야 한다(읽기 전용이면 큐에 넣을 수가 없다).
-- 다만 아무 컬럼이나 만지게 두면 안 되므로, 요청 등록은 서버 라우트(service-role)가 대신 하고
-- RLS 는 그대로 둔다 — 즉 이 마이그레이션은 스키마만 넓히고 권한은 손대지 않는다.

COMMENT ON COLUMN sh_naver_sourcing_products.detail_status IS
  'none=목록만 | requested=셀러가 요청 | running=도우미가 추출 중 | done=상세 확보 | failed=실패';
