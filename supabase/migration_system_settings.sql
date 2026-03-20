-- system_settings: 관리자 동적 설정 (IP/URL 등)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('coupang_whitelist_ips', '66.241.125.108, 216.246.19.71, 66.241.124.130, 216.246.19.84, 14.52.102.116, 54.116.7.181, 3.37.67.57, 137.66.13.24, 79.127.159.103'),
  ('coupang_integration_url', 'https://product-automation-saas.vercel.app/')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 읽기 허용
CREATE POLICY "system_settings_read" ON system_settings
  FOR SELECT USING (true);

-- 관리자만 수정 허용
CREATE POLICY "system_settings_admin_update" ON system_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
