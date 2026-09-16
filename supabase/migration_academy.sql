-- ============================================================
-- 셀러 독학 아카데미 — Phase 0 + 1
--   Phase 0: 진행 상태를 localStorage 에서 서버로 옮긴다
--   Phase 1: 자동 판정(verify) 엔진의 저장소
--
-- 설계: 셀러_독학_아카데미_설계도.md
--
-- ★ 콘텐츠(스텝 본문)는 이 DB 에 없다. src/lib/data/academy/ 의 TypeScript 다.
--   여기 있는 건 "누가 어디까지 했고, 무엇을 근거로 통과시켰나" 뿐이다.
-- ============================================================

-- ── 1. 스텝 진행 ────────────────────────────────────────────
-- 기존 src/lib/utils/tutorial-progress.ts (localStorage) 를 대체한다.
CREATE TABLE IF NOT EXISTS academy_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked','available','in_progress','passed','needs_review')),
  -- 어떤 레벨로 통과했는지 (1=자동판정 2=증빙 3=자가확인+퀴즈). 감사용.
  verify_level SMALLINT,
  -- 판정 근거 스냅샷. "무엇을 보고 통과시켰나" 를 나중에 되짚을 수 있어야 한다.
  verify_payload JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  -- L2 증빙 파일 (비공개 버킷 경로). 사업자등록증 등 민감정보.
  evidence_path TEXT,
  passed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_academy_progress_user
  ON academy_progress(user_id, status);

-- ── 2. XP 원장 (append-only) ────────────────────────────────
-- ★ 잔액 컬럼을 두지 않는다. 합계는 언제나 이 원장에서 재계산된다.
--   잔액을 따로 들고 있으면 언젠가 반드시 원장과 어긋난다.
CREATE TABLE IF NOT EXISTS academy_xp_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('step_passed','badge','quest','streak')),
  ref_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- ★ 중복 지급 원천 차단. 같은 스텝을 두 번 통과해도 XP 는 한 번.
  UNIQUE (user_id, reason, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_academy_xp_user
  ON academy_xp_ledger(user_id, created_at DESC);

-- ── 3. 뱃지 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 무엇을 보고 줬는가 (자기신고가 아니라는 증거)
  proof JSONB,
  PRIMARY KEY (user_id, badge_key)
);

-- ── 4. 스트릭 ──────────────────────────────────────────────
-- "연속 로그인" 이 아니라 "연속 운영" 이다 — 주문처리/문의답변/상품등록/스텝통과.
CREATE TABLE IF NOT EXISTS academy_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_days INTEGER NOT NULL DEFAULT 0,
  best_days INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  freeze_used_this_week SMALLINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. 판정 로그 ───────────────────────────────────────────
-- "어느 스텝에서 사람이 죽는가" — 콘텐츠 개선의 유일한 근거다.
-- 실패도 반드시 남긴다. 성공만 남기면 개선할 곳을 영영 못 찾는다.
CREATE TABLE IF NOT EXISTS academy_verify_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  level SMALLINT NOT NULL,
  passed BOOLEAN NOT NULL,
  probe TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_verify_step
  ON academy_verify_log(step_key, passed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_verify_user
  ON academy_verify_log(user_id, created_at DESC);

-- ── 6. TTS 자산 ────────────────────────────────────────────
-- 생성은 로컬 배치(scripts/academy-tts-build.mjs), 서빙은 정적 파일.
-- 프로덕션에 OPENAI_API_KEY 를 두지 않기 위한 구조다.
CREATE TABLE IF NOT EXISTS academy_tts_assets (
  step_key TEXT NOT NULL,
  -- narration[] 해시. 대본이 바뀌면 값이 달라져 자동으로 재생성 대상이 된다.
  script_hash TEXT NOT NULL,
  voice TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  -- 문장별 타임스탬프 [{ index, startMs, endMs }] — 하이라이트 동기화용
  marks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (step_key, script_hash, voice)
);

-- ── 7. updated_at 자동 갱신 ────────────────────────────────
CREATE OR REPLACE FUNCTION update_academy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_academy_progress_updated ON academy_progress;
CREATE TRIGGER trg_academy_progress_updated
  BEFORE UPDATE ON academy_progress
  FOR EACH ROW EXECUTE FUNCTION update_academy_updated_at();

DROP TRIGGER IF EXISTS trg_academy_streaks_updated ON academy_streaks;
CREATE TRIGGER trg_academy_streaks_updated
  BEFORE UPDATE ON academy_streaks
  FOR EACH ROW EXECUTE FUNCTION update_academy_updated_at();

-- ── 8. RLS ─────────────────────────────────────────────────
-- 읽기는 본인 것만. 쓰기는 서비스 클라이언트(API 라우트)만 —
-- 클라이언트가 직접 XP 를 쓸 수 있으면 게이미피케이션은 그 순간 무의미해진다.
ALTER TABLE academy_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_xp_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_badges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_streaks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_verify_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_tts_assets  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academy_progress_select_own ON academy_progress;
CREATE POLICY academy_progress_select_own ON academy_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS academy_xp_select_own ON academy_xp_ledger;
CREATE POLICY academy_xp_select_own ON academy_xp_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS academy_badges_select_own ON academy_badges;
CREATE POLICY academy_badges_select_own ON academy_badges
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS academy_streaks_select_own ON academy_streaks;
CREATE POLICY academy_streaks_select_own ON academy_streaks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS academy_verify_log_select_own ON academy_verify_log;
CREATE POLICY academy_verify_log_select_own ON academy_verify_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- TTS 자산은 콘텐츠라 로그인한 누구나 읽는다(오디오 자체는 Storage 권한으로 막는다).
DROP POLICY IF EXISTS academy_tts_select_all ON academy_tts_assets;
CREATE POLICY academy_tts_select_all ON academy_tts_assets
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE academy_progress   IS '아카데미 스텝별 진행 — localStorage 대체. 통과 근거(verify_payload)까지 남긴다';
COMMENT ON TABLE academy_xp_ledger  IS 'XP 원장(append-only). 잔액은 항상 SUM 으로 재계산';
COMMENT ON TABLE academy_verify_log IS '판정 시도 로그(실패 포함) — 어느 스텝에서 이탈하는지 찾는 근거';
