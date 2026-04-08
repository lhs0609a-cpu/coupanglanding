-- ========================================================
-- 품절 동기화 시스템 (Stock Monitor)
-- sh_stock_monitors + sh_stock_monitor_logs + sh_products.source_url
-- ========================================================

-- 1. sh_products에 source_url 컬럼 추가
ALTER TABLE sh_products ADD COLUMN IF NOT EXISTS source_url TEXT;

-- 2. sh_stock_monitors — 모니터링 대상 레지스트리
CREATE TABLE IF NOT EXISTS sh_stock_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES sh_products(id) ON DELETE CASCADE,
  coupang_product_id TEXT NOT NULL,
  source_url TEXT NOT NULL,

  -- 원본(네이버 등) 재고 상태
  source_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (source_status IN ('in_stock', 'sold_out', 'removed', 'unknown', 'error')),

  -- 쿠팡 상태
  coupang_status TEXT NOT NULL DEFAULT 'active'
    CHECK (coupang_status IN ('active', 'suspended')),

  -- 등록한 옵션명 (네이버 원본 옵션명 — 이 옵션이 품절되면 품절 판정)
  registered_option_name TEXT,

  -- 옵션별 품절 상태 (JSON 배열)
  option_statuses JSONB DEFAULT '[]'::jsonb,

  -- 연속 unknown 카운트 (3회 이상 시 구조 변경 의심 알림)
  consecutive_unknowns INT NOT NULL DEFAULT 0,

  -- 활성 여부 + 체크 주기
  is_active BOOLEAN NOT NULL DEFAULT true,
  check_interval_minutes INT NOT NULL DEFAULT 30,

  -- 타임스탬프
  last_checked_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,

  -- 연속 에러 카운트 (10 초과 시 자동 비활성화)
  consecutive_errors INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 유니크 제약 (동일 유저 + 상품 중복 방지)
  CONSTRAINT uq_stock_monitor_user_product UNIQUE (megaload_user_id, product_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_stock_monitors_user ON sh_stock_monitors(megaload_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_monitors_active ON sh_stock_monitors(is_active, last_checked_at)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stock_monitors_source_status ON sh_stock_monitors(source_status);

-- 3. sh_stock_monitor_logs — 변경 이력 감사 로그
CREATE TABLE IF NOT EXISTS sh_stock_monitor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES sh_stock_monitors(id) ON DELETE CASCADE,
  megaload_user_id TEXT NOT NULL,

  -- 이벤트 유형
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'source_sold_out', 'source_restocked', 'source_removed',
      'coupang_suspended', 'coupang_resumed',
      'check_error', 'check_ok'
    )),

  -- 상태 변경 전/후
  source_status_before TEXT,
  source_status_after TEXT,
  coupang_status_before TEXT,
  coupang_status_after TEXT,

  -- 옵션 제품용
  option_name TEXT,

  -- 실행 결과
  action_taken TEXT,
  action_success BOOLEAN,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_monitor_logs_monitor ON sh_stock_monitor_logs(monitor_id);
CREATE INDEX IF NOT EXISTS idx_stock_monitor_logs_user ON sh_stock_monitor_logs(megaload_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_monitor_logs_created ON sh_stock_monitor_logs(created_at DESC);

-- 4. RLS 정책
ALTER TABLE sh_stock_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_stock_monitor_logs ENABLE ROW LEVEL SECURITY;

-- service_role 전체 접근 (cron, API)
CREATE POLICY "service_role_stock_monitors" ON sh_stock_monitors
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_stock_monitor_logs" ON sh_stock_monitor_logs
  FOR ALL USING (true) WITH CHECK (true);
