-- ============================================================
-- 수동 입력 요청 승인 시스템 마이그레이션
-- manual_input_requests 테이블 + monthly_reports.input_source
-- ============================================================

-- 1. 수동 입력 승인 요청 테이블
CREATE TABLE IF NOT EXISTS manual_input_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_user_id UUID REFERENCES pt_users(id) ON DELETE CASCADE NOT NULL,
  year_month TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  requested_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(pt_user_id, year_month)
);

-- 2. monthly_reports에 입력 소스 컬럼 추가
ALTER TABLE monthly_reports ADD COLUMN IF NOT EXISTS input_source TEXT DEFAULT 'api'
  CHECK (input_source IN ('api', 'manual_approved'));

-- 3. RLS 정책
ALTER TABLE manual_input_requests ENABLE ROW LEVEL SECURITY;

-- PT 사용자: 본인 요청만 조회/생성
CREATE POLICY "pt_users_select_own_manual_requests"
  ON manual_input_requests FOR SELECT
  USING (
    pt_user_id IN (
      SELECT id FROM pt_users WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "pt_users_insert_own_manual_requests"
  ON manual_input_requests FOR INSERT
  WITH CHECK (
    pt_user_id IN (
      SELECT id FROM pt_users WHERE profile_id = auth.uid()
    )
  );

-- 관리자: 모든 요청 조회/수정
CREATE POLICY "admins_select_all_manual_requests"
  ON manual_input_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_update_manual_requests"
  ON manual_input_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_manual_input_requests_pt_user
  ON manual_input_requests(pt_user_id);
CREATE INDEX IF NOT EXISTS idx_manual_input_requests_status
  ON manual_input_requests(status);
CREATE INDEX IF NOT EXISTS idx_manual_input_requests_year_month
  ON manual_input_requests(year_month);
