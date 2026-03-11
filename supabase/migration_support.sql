-- ============================================================
-- 파트너 고객센터: 공지사항 + 1:1 문의 + FAQ
-- ============================================================

-- 1. notices: 공지사항
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system' CHECK (category IN ('system', 'policy', 'promotion', 'education', 'emergency')),
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. notice_reads: 읽음 처리
CREATE TABLE IF NOT EXISTS notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(notice_id, profile_id)
);

-- 3. support_tickets: 1:1 문의
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('settlement', 'contract', 'coupang_api', 'tax_invoice', 'system_error', 'other')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ticket_messages: 대화 스레드
CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
  content TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. faqs: 자주 묻는 질문
CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('signup', 'settlement', 'commission', 'coupang_api', 'tax_invoice', 'penalty', 'other')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  view_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS 정책
-- ============================================================

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- notices: admin ALL, authenticated SELECT (published only)
CREATE POLICY "notices_admin_all" ON notices
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "notices_user_select" ON notices
  FOR SELECT TO authenticated
  USING (is_published = true);

-- notice_reads: user INSERT/SELECT own
CREATE POLICY "notice_reads_user_insert" ON notice_reads
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "notice_reads_user_select" ON notice_reads
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- support_tickets: admin ALL, user SELECT/INSERT own
CREATE POLICY "support_tickets_admin_all" ON support_tickets
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "support_tickets_user_select" ON support_tickets
  FOR SELECT TO authenticated
  USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "support_tickets_user_insert" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

-- ticket_messages: admin ALL, user SELECT own ticket's + INSERT
CREATE POLICY "ticket_messages_admin_all" ON ticket_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "ticket_messages_user_select" ON ticket_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets
      WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    )
  );

CREATE POLICY "ticket_messages_user_insert" ON ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND ticket_id IN (
      SELECT id FROM support_tickets
      WHERE pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    )
  );

-- faqs: admin ALL, authenticated SELECT (published only)
CREATE POLICY "faqs_admin_all" ON faqs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "faqs_user_select" ON faqs
  FOR SELECT TO authenticated
  USING (is_published = true);

-- ============================================================
-- 인덱스
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_notices_published ON notices(is_published, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notice_reads_profile ON notice_reads(profile_id, notice_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_pt_user ON support_tickets(pt_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs(is_published, category, sort_order);
