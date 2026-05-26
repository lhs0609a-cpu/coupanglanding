-- ============================================================
-- megaload_llm_jobs: 로컬 GPU(Ollama) 워커용 텍스트 재생성/재매칭 잡 큐
-- ------------------------------------------------------------
-- 웹에서 노출상품명/상세글/옵션수량/카테고리 "LLM 재생성" 클릭 → pending 잡 INSERT.
-- 상품은 클라이언트(브라우저)에만 존재하므로 input(jsonb)에 필요한 컨텍스트를 담아 보낸다.
-- 로컬 워커(메가로드 도우미)가 본인 잡만 claim → Ollama 생성/임베딩 → result(jsonb) 기록.
-- 워커는 service_role 없이 사용자 JWT로만 접근 → RLS로 본인 잡만 강제.
-- (썸네일 잡 큐 megaload_thumbnail_jobs 와 동형)
-- ★ 실행: Supabase 대시보드 > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS megaload_llm_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  batch_id UUID,                                    -- 한 번의 재생성 묶음 식별
  label TEXT,                                       -- "{uid}:{task}" — 어느 상품/필드에 적용할지
  task_type TEXT NOT NULL
    CHECK (task_type IN ('display_name','content','options','category')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,         -- 상품명/카테고리/현재값/지시 등 생성 컨텍스트
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','error','canceled')),
  result JSONB,                                     -- 생성/매칭 결과
  error_message TEXT,
  worker_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_jobs_user_status
  ON megaload_llm_jobs(megaload_user_id, status);
CREATE INDEX IF NOT EXISTS idx_llm_jobs_claim
  ON megaload_llm_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_jobs_batch
  ON megaload_llm_jobs(batch_id);

-- ── RLS: 본인(megaload_users.profile_id = auth.uid()) 잡만 접근 ──
ALTER TABLE megaload_llm_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS llm_jobs_select_own ON megaload_llm_jobs;
CREATE POLICY llm_jobs_select_own ON megaload_llm_jobs FOR SELECT
  TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS llm_jobs_insert_own ON megaload_llm_jobs;
CREATE POLICY llm_jobs_insert_own ON megaload_llm_jobs FOR INSERT
  TO authenticated
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS llm_jobs_update_own ON megaload_llm_jobs;
CREATE POLICY llm_jobs_update_own ON megaload_llm_jobs FOR UPDATE
  TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE ON megaload_llm_jobs TO authenticated;

-- ── 원자적 claim: pending(또는 5분 넘은 stale processing) 잡을 SKIP LOCKED 로 잡음 ──
CREATE OR REPLACE FUNCTION claim_llm_jobs(
  p_worker_id TEXT,
  p_limit INT DEFAULT 4
) RETURNS SETOF megaload_llm_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  UPDATE megaload_llm_jobs j
     SET status     = 'processing',
         worker_id  = p_worker_id,
         claimed_at = NOW(),
         attempts   = j.attempts + 1
   WHERE j.id IN (
     SELECT c.id
       FROM megaload_llm_jobs c
      WHERE c.megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = v_uid)
        AND (
          c.status = 'pending'
          OR (c.status = 'processing' AND c.claimed_at < NOW() - INTERVAL '5 minutes')
        )
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(p_limit, 20))
   )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_llm_jobs(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_llm_jobs(TEXT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
