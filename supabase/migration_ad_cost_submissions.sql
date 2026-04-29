-- 광고비 월별 제출 시스템
--
-- 흐름:
--   1. 매월 1일까지 PT 사용자가 직전 달 광고비 스크린샷 제출
--   2. 관리자가 검토 → approved/rejected
--   3. approved 시 monthly_reports.cost_advertising 자동 반영
--   4. 매월 2일 00:00 미제출분은 missed 로 lock (광고비 0 확정)
--
-- 재제출 정책: 같은 (pt_user_id, year_month) 에 최대 2회 (initial + 재제출 1회)
-- 과대청구 가드: 200% 초과는 trigger 에서 차단, 30% 이상은 admin UI 에서 flag

CREATE TABLE IF NOT EXISTS ad_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,                      -- 광고비 발생 월 (예: '2026-04')
  amount BIGINT NOT NULL CHECK (amount >= 0),    -- 청구 금액 (원)
  screenshot_url TEXT NOT NULL,                  -- 광고 플랫폼 스크린샷 URL
  attempt_no INT NOT NULL DEFAULT 1 CHECK (attempt_no BETWEEN 1 AND 2),  -- 1=초회, 2=재제출
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'missed', 'locked')),
  -- pending  : 검토 대기
  -- approved : 승인됨 (cost_advertising 반영)
  -- rejected : 반려됨 (재제출 가능; attempt_no=2 후 재반려 시 locked 로 전환)
  -- missed   : 마감일까지 미제출 (cron 으로 자동 생성, 광고비 0 lock)
  -- locked   : 2회 반려 누적 → 더 이상 제출 불가, 광고비 0 확정
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_admin_id UUID REFERENCES auth.users(id),
  reject_reason TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 한 사용자가 한 월에 같은 attempt_no 로 중복 제출 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_cost_submissions_unique
  ON ad_cost_submissions(pt_user_id, year_month, attempt_no);

-- 관리자 큐 — pending 빠른 조회
CREATE INDEX IF NOT EXISTS idx_ad_cost_submissions_pending
  ON ad_cost_submissions(status, submitted_at DESC)
  WHERE status = 'pending';

-- 위젯/리포트에서 사용자별 최신 approved 빠른 조회
CREATE INDEX IF NOT EXISTS idx_ad_cost_submissions_user_month
  ON ad_cost_submissions(pt_user_id, year_month, status);

-- updated_at 자동 갱신 trigger
CREATE OR REPLACE FUNCTION update_ad_cost_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_cost_submissions_updated_at ON ad_cost_submissions;
CREATE TRIGGER trg_ad_cost_submissions_updated_at
  BEFORE UPDATE ON ad_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_cost_submissions_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- RLS 정책
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE ad_cost_submissions ENABLE ROW LEVEL SECURITY;

-- 사용자: 본인 것만 읽기
DROP POLICY IF EXISTS ad_cost_submissions_select_own ON ad_cost_submissions;
CREATE POLICY ad_cost_submissions_select_own ON ad_cost_submissions
  FOR SELECT
  USING (
    pt_user_id IN (
      SELECT id FROM pt_users WHERE profile_id = auth.uid()
    )
  );

-- 사용자: 본인 것만 insert (status=pending 으로만)
DROP POLICY IF EXISTS ad_cost_submissions_insert_own ON ad_cost_submissions;
CREATE POLICY ad_cost_submissions_insert_own ON ad_cost_submissions
  FOR INSERT
  WITH CHECK (
    pt_user_id IN (
      SELECT id FROM pt_users WHERE profile_id = auth.uid()
    )
    AND status = 'pending'
  );

-- 관리자/서비스 키 read/write 는 service_role 로 우회 (별도 정책 불필요)

-- ─────────────────────────────────────────────────────────────────
-- 인앱 알림 타입 (notifications 테이블에 신규 type 추가시 별도 작업)
--   ad_cost_reminder            -- 매월 1일 미제출 알림
--   ad_cost_approved            -- 관리자 승인됨
--   ad_cost_rejected            -- 관리자 반려됨
--   ad_cost_locked              -- 2회 반려 → lock
-- ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE ad_cost_submissions IS
  '월별 광고비 제출/승인 흐름. 매월 1일까지 직전 달 광고비를 스크린샷과 함께 제출하면 관리자 검토 후 승인된 amount 가 monthly_reports.cost_advertising 에 반영됨. 미제출/2회 반려는 광고비 0 확정.';
