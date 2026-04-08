-- =============================================
-- 메가로드 오류문의 시스템 (Bug Report System)
-- =============================================

-- 1. 오류 리포트 테이블
CREATE TABLE IF NOT EXISTS sh_bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('ui_bug','data_error','api_error','performance','feature_request','general')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  page_url TEXT,
  browser_info TEXT,
  screen_size TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 오류 리포트 메시지 테이블
CREATE TABLE IF NOT EXISTS sh_bug_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES sh_bug_reports(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin')),
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 인덱스
CREATE INDEX idx_sh_bug_reports_user_status ON sh_bug_reports(megaload_user_id, status);
CREATE INDEX idx_sh_bug_reports_status_created ON sh_bug_reports(status, created_at DESC);
CREATE INDEX idx_sh_bug_report_msgs_report ON sh_bug_report_messages(bug_report_id, created_at);
CREATE INDEX idx_sh_bug_report_msgs_unread ON sh_bug_report_messages(sender_role, is_read) WHERE is_read = false;

-- 4. RLS
ALTER TABLE sh_bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_bug_report_messages ENABLE ROW LEVEL SECURITY;

-- Admin: 전체 접근
CREATE POLICY "admin_all_bug_reports" ON sh_bug_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_all_bug_report_messages" ON sh_bug_report_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- User: 자기 리포트만 SELECT
CREATE POLICY "user_select_own_bug_reports" ON sh_bug_reports
  FOR SELECT USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

-- User: 자기 리포트만 INSERT
CREATE POLICY "user_insert_own_bug_reports" ON sh_bug_reports
  FOR INSERT WITH CHECK (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

-- User: 자기 리포트의 메시지 SELECT
CREATE POLICY "user_select_own_bug_messages" ON sh_bug_report_messages
  FOR SELECT USING (
    bug_report_id IN (
      SELECT br.id FROM sh_bug_reports br
      JOIN megaload_users mu ON mu.id = br.megaload_user_id
      WHERE mu.profile_id = auth.uid()
    )
  );

-- User: 자기 리포트에 메시지 INSERT
CREATE POLICY "user_insert_own_bug_messages" ON sh_bug_report_messages
  FOR INSERT WITH CHECK (
    bug_report_id IN (
      SELECT br.id FROM sh_bug_reports br
      JOIN megaload_users mu ON mu.id = br.megaload_user_id
      WHERE mu.profile_id = auth.uid()
    )
  );

-- User: 자기 메시지의 is_read UPDATE (관리자 답글 읽음 처리)
CREATE POLICY "user_update_read_bug_messages" ON sh_bug_report_messages
  FOR UPDATE USING (
    bug_report_id IN (
      SELECT br.id FROM sh_bug_reports br
      JOIN megaload_users mu ON mu.id = br.megaload_user_id
      WHERE mu.profile_id = auth.uid()
    )
  ) WITH CHECK (
    bug_report_id IN (
      SELECT br.id FROM sh_bug_reports br
      JOIN megaload_users mu ON mu.id = br.megaload_user_id
      WHERE mu.profile_id = auth.uid()
    )
  );
