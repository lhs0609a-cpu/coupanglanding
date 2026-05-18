-- 올인원 자동 등록 잡 (Auto-mode)
-- 사용자가 최상위 폴더 1번 선택 → 1000~2000개 상품 끝까지 자동 등록.
-- 브라우저 탭 닫혀도 resume 가능하도록 진행 상태를 영속화.
-- Gate 1: 사전분석 확인 / Gate 2: 자동 일시정지 임계치 / Gate 3: hard stop 사유 기록.

CREATE TABLE IF NOT EXISTS sh_auto_register_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,

  -- 상태
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Gate 1 확인 대기
    'scanning',     -- 폴더 스캔 중
    'registering',  -- 등록 진행 중
    'paused',       -- Gate 2 자동 일시정지 (사용자 확인 대기)
    'completed',    -- 모든 상품 처리 완료
    'aborted',      -- 사용자 중단 또는 Gate 3 hard stop
    'failed'        -- 복구 불가 실패
  )),

  -- 입력 메타
  root_folder_name TEXT,        -- 표시용 (browser File System Handle 자체는 직렬화 불가)
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,

  -- Gate 1 사전분석 결과
  pre_analysis JSONB,           -- { productCount, imageCount, estDurationMin, estAiCostUsd, warnings: [] }
  gate1_confirmed_at TIMESTAMPTZ,

  -- Gate 2 임계치 (사용자 설정 가능)
  pause_failure_rate NUMERIC NOT NULL DEFAULT 0.10,    -- 배치당 실패율 10% 이상 → 자동 일시정지
  pause_on_429_burst INTEGER NOT NULL DEFAULT 5,       -- 쿠팡 429 연속 N회 → 일시정지
  pause_on_zero_price BOOLEAN NOT NULL DEFAULT TRUE,   -- 0원 상품 감지 → 일시정지
  min_category_match_rate NUMERIC NOT NULL DEFAULT 0.80,

  -- 진행 카운터 (체크포인트)
  total_products INTEGER NOT NULL DEFAULT 0,
  processed_products INTEGER NOT NULL DEFAULT 0,
  success_products INTEGER NOT NULL DEFAULT 0,
  failed_products INTEGER NOT NULL DEFAULT 0,
  last_checkpoint_idx INTEGER NOT NULL DEFAULT 0,     -- resume 시작 인덱스
  last_checkpoint_at TIMESTAMPTZ,

  -- 일시정지/중단 사유
  pause_reason TEXT,             -- 'failure_rate' | 'rate_limit' | 'zero_price' | 'category_match' | 'manual' | 'payment_lock' | 'quota'
  pause_detail JSONB,            -- { rate: 0.18, sampleErrors: [...] }
  paused_at TIMESTAMPTZ,

  -- 결과 요약
  result_summary JSONB,          -- { successByCategory: {...}, failuresByReason: {...}, durationMs }

  -- 타임스탬프
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_jobs_user_status
  ON sh_auto_register_jobs(megaload_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_jobs_active
  ON sh_auto_register_jobs(status, last_checkpoint_at)
  WHERE status IN ('scanning', 'registering', 'paused');

-- RLS
ALTER TABLE sh_auto_register_jobs ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 megaload_user 잡만 조회/수정
CREATE POLICY "auto_jobs_owner_select"
  ON sh_auto_register_jobs FOR SELECT
  USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

-- 쓰기는 service role 만 (API 라우트에서 처리)
CREATE POLICY "auto_jobs_service_write"
  ON sh_auto_register_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE sh_auto_register_jobs IS
  '올인원 자동 등록 잡 — 1000~2000개 상품 무인 등록을 위한 체크포인트/Gate 영속 상태';
