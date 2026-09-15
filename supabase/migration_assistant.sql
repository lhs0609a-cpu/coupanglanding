-- ============================================================
-- AI 상담 봇 (어디서나 뜨는 플로팅 상담)
--   - 대화/메시지 저장: 사용자가 새로고침해도 이어서 상담, 관리자가 사후 검토
--   - 미해결 플래그: "봇이 못 푼 질문"만 모아서 지식베이스를 보강하는 피드백 루프
--
-- 비로그인(공개 랜딩) 방문자도 상담이 가능해야 하므로 profile_id 는 NULL 허용이고,
-- 대신 클라이언트가 만든 anon_key(로컬 저장) 로 자기 대화만 이어가게 한다.
-- 조회/쓰기는 전부 서버 라우트(service role)를 거치므로 RLS 는 기본 차단으로 둔다.
-- ============================================================

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- 비로그인 방문자 식별용 (브라우저 로컬에 저장되는 난수). 로그인 사용자도 함께 기록.
  anon_key TEXT,
  -- 대화가 시작된 페이지 / 마지막 페이지
  entry_path TEXT,
  last_path TEXT,
  -- 'public' | 'pt' | 'megaload' | 'admin' — 상담 맥락
  surface TEXT NOT NULL DEFAULT 'public',
  title TEXT,
  message_count INT NOT NULL DEFAULT 0,
  -- 봇이 스스로 "해결 못 했다"고 판단했거나 사용자가 사람 연결을 누른 경우
  escalated BOOLEAN NOT NULL DEFAULT false,
  escalated_ticket_id UUID,
  escalated_bug_report_id UUID,
  -- 사용자 피드백 (👍/👎) 집계
  helpful_count INT NOT NULL DEFAULT 0,
  unhelpful_count INT NOT NULL DEFAULT 0,
  -- 관리자 검토 완료 여부
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  -- 어떤 KB 문서를 근거로 답했는지 / 어떤 툴을 호출했는지
  sources JSONB NOT NULL DEFAULT '[]',
  tool_calls JSONB NOT NULL DEFAULT '[]',
  -- 이 답변이 만들어진 페이지
  path TEXT,
  -- 👍 1 / 👎 -1 / 미평가 0
  rating SMALLINT NOT NULL DEFAULT 0,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conv_profile
  ON assistant_conversations(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conv_anon
  ON assistant_conversations(anon_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conv_escalated
  ON assistant_conversations(escalated, updated_at DESC) WHERE escalated = true;
CREATE INDEX IF NOT EXISTS idx_assistant_conv_review
  ON assistant_conversations(reviewed, updated_at DESC) WHERE reviewed = false;
CREATE INDEX IF NOT EXISTS idx_assistant_msg_conv
  ON assistant_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_msg_rating
  ON assistant_messages(rating, created_at DESC) WHERE rating <> 0;

ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

-- 서버 라우트(service role)만 접근. 클라이언트 직접 접근은 전부 차단.
DROP POLICY IF EXISTS "assistant_conv_admin_all" ON assistant_conversations;
CREATE POLICY "assistant_conv_admin_all" ON assistant_conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'partner')
    )
  );

DROP POLICY IF EXISTS "assistant_conv_own_read" ON assistant_conversations;
CREATE POLICY "assistant_conv_own_read" ON assistant_conversations
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "assistant_msg_admin_all" ON assistant_messages;
CREATE POLICY "assistant_msg_admin_all" ON assistant_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'partner')
    )
  );

DROP POLICY IF EXISTS "assistant_msg_own_read" ON assistant_messages;
CREATE POLICY "assistant_msg_own_read" ON assistant_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id AND c.profile_id = auth.uid()
    )
  );

-- ── 관리자가 봇 지식을 직접 추가/수정하는 테이블 ──
-- 코드에 박힌 KB 는 배포가 필요하지만, 여기에 넣은 항목은 즉시 반영된다.
CREATE TABLE IF NOT EXISTS assistant_kb_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  -- 검색 가중치용 키워드
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- 이 문서가 특히 관련 있는 경로들 (예: {'/megaload/products/bulk-register'})
  paths TEXT[] NOT NULL DEFAULT '{}',
  -- 'public' | 'pt' | 'megaload' | 'all'
  audience TEXT NOT NULL DEFAULT 'all',
  priority INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_kb_published
  ON assistant_kb_entries(is_published, priority DESC);

ALTER TABLE assistant_kb_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assistant_kb_admin_all" ON assistant_kb_entries;
CREATE POLICY "assistant_kb_admin_all" ON assistant_kb_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'partner')
    )
  );

DROP POLICY IF EXISTS "assistant_kb_read" ON assistant_kb_entries;
CREATE POLICY "assistant_kb_read" ON assistant_kb_entries
  FOR SELECT USING (is_published = true);

-- ── message_count 자동 유지 ──
-- 라우트에서 직접 세면 히스토리 절삭(최근 12턴만 로드) 때문에 실제보다 적게 잡힌다.
-- DB 가 세는 게 항상 맞다.
CREATE OR REPLACE FUNCTION assistant_bump_message_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE assistant_conversations
     SET message_count = message_count + 1,
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assistant_bump_message_count ON assistant_messages;
CREATE TRIGGER trg_assistant_bump_message_count
  AFTER INSERT ON assistant_messages
  FOR EACH ROW EXECUTE FUNCTION assistant_bump_message_count();

-- 트리거 도입 전에 들어온 행 보정
UPDATE assistant_conversations c
   SET message_count = (SELECT count(*) FROM assistant_messages m WHERE m.conversation_id = c.id)
 WHERE c.message_count <> (SELECT count(*) FROM assistant_messages m WHERE m.conversation_id = c.id);
