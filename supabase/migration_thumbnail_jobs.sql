-- ============================================================
-- megaload_thumbnail_jobs: 로컬 GPU 워커용 썸네일 재생성 잡 큐
-- ------------------------------------------------------------
-- 웹에서 "전체 썸네일 재생성" 클릭 → pending 잡 N건 INSERT.
-- 사용자가 설치한 로컬 워커(ComfyUI/SDXL)가 본인 잡만 claim → 생성 →
-- 결과 URL 기록. 워커는 service_role 키를 갖지 않고 "사용자 JWT"로만
-- 접근하므로 RLS로 본인 잡만 보이도록 강제한다.
-- ============================================================

CREATE TABLE IF NOT EXISTS megaload_thumbnail_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  batch_id UUID,                                    -- 한 번의 "전체 재생성" 묶음 식별
  source_url TEXT NOT NULL,                         -- 누끼 원본 (워커가 다운로드 가능한 URL)
  product_code TEXT,                                -- product_001 등 표시용
  label TEXT,                                       -- 파일명 등 표시용
  prompt TEXT,                                      -- override (NULL이면 워커 기본 프롬프트)
  negative_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','error','canceled')),
  result_url TEXT,                                  -- 생성 결과 (product-images 버킷 공개 URL)
  error_message TEXT,
  worker_id TEXT,                                   -- claim한 워커 식별자
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thumb_jobs_user_status
  ON megaload_thumbnail_jobs(megaload_user_id, status);
CREATE INDEX IF NOT EXISTS idx_thumb_jobs_claim
  ON megaload_thumbnail_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_thumb_jobs_batch
  ON megaload_thumbnail_jobs(batch_id);

-- ── RLS: 본인(megaload_users.profile_id = auth.uid()) 잡만 접근 ──
ALTER TABLE megaload_thumbnail_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thumb_jobs_select_own ON megaload_thumbnail_jobs;
CREATE POLICY thumb_jobs_select_own ON megaload_thumbnail_jobs FOR SELECT
  TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS thumb_jobs_insert_own ON megaload_thumbnail_jobs;
CREATE POLICY thumb_jobs_insert_own ON megaload_thumbnail_jobs FOR INSERT
  TO authenticated
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS thumb_jobs_update_own ON megaload_thumbnail_jobs;
CREATE POLICY thumb_jobs_update_own ON megaload_thumbnail_jobs FOR UPDATE
  TO authenticated
  USING (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()))
  WITH CHECK (megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid()));

-- service_role 은 RLS 우회 — 서버 라우트(enqueue/status)에서 사용.
GRANT SELECT, INSERT, UPDATE ON megaload_thumbnail_jobs TO authenticated;

-- ── 원자적 claim: pending(또는 10분 넘은 stale processing) 잡을 SKIP LOCKED 로 잡음 ──
-- SECURITY DEFINER 이지만 내부에서 auth.uid() 로 호출자 본인 잡으로 스코프를 강제한다.
CREATE OR REPLACE FUNCTION claim_thumbnail_jobs(
  p_worker_id TEXT,
  p_limit INT DEFAULT 1
) RETURNS SETOF megaload_thumbnail_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  UPDATE megaload_thumbnail_jobs j
     SET status     = 'processing',
         worker_id  = p_worker_id,
         claimed_at = NOW(),
         attempts   = j.attempts + 1
   WHERE j.id IN (
     SELECT c.id
       FROM megaload_thumbnail_jobs c
      WHERE c.megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = v_uid)
        AND (
          c.status = 'pending'
          OR (c.status = 'processing' AND c.claimed_at < NOW() - INTERVAL '10 minutes')
        )
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(p_limit, 20))
   )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_thumbnail_jobs(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_thumbnail_jobs(TEXT, INT) TO authenticated;

-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 위 SQL 실행
