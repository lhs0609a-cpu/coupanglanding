-- 아카데미 첫 진입 안내를 봤는가.
-- 가입 직후 자동으로 아카데미로 보내되, 한 번 보고 나면 다시 낚아채지 않기 위해 필요하다.
-- 사용자 단위 아카데미 상태는 academy_streaks 가 이미 1인 1행이라 여기에 둔다.
ALTER TABLE academy_streaks ADD COLUMN IF NOT EXISTS intro_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN academy_streaks.intro_seen_at IS
  '아카데미 환영 화면을 본 시각. NULL 이면 로그인 시 아카데미로 자동 안내한다';
