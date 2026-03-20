-- 사전등록 테이블: 관리자가 사전등록한 이메일만 가입 가능
CREATE TABLE IF NOT EXISTS pre_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  share_percentage NUMERIC(5,2) NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'used', 'cancelled')),
  memo TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  used_at TIMESTAMPTZ,
  used_by_profile_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- pending 상태인 이메일은 중복 불가
CREATE UNIQUE INDEX idx_pre_reg_email ON pre_registrations(LOWER(email)) WHERE status = 'pending';

-- RLS 비활성화 (서비스 롤에서만 접근)
ALTER TABLE pre_registrations ENABLE ROW LEVEL SECURITY;
