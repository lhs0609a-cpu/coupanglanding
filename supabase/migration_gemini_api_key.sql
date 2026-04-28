-- Gemini API key (per-user) for 썸네일 재생성 기능
-- 각 수강생이 본인 AI Studio 키를 저장하고, 본인 쿼터(500/일 무료)로 호출

ALTER TABLE megaload_users
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

COMMENT ON COLUMN megaload_users.gemini_api_key IS
  'Google AI Studio에서 발급받은 Gemini API 키. 썸네일 재생성 등 이미지 AI 기능 사용 시 본인 쿼터 차감.';
