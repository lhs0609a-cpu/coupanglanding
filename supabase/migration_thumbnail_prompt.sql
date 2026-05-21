-- 로컬 GPU 워커 썸네일 재생성 — 계정별 기본 프롬프트 (positive/negative)
-- 웹 설정 '로컬 GPU 썸네일' 탭에서 저장. 비워두면 워커 내장 기본값 사용.
-- enqueue 시 잡에 명시 프롬프트가 없으면 이 계정 기본값을 자동 첨부한다.

ALTER TABLE megaload_users
  ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_negative_prompt TEXT;

COMMENT ON COLUMN megaload_users.thumbnail_prompt IS
  '로컬 GPU 워커 썸네일 생성용 positive 프롬프트(계정 기본값). NULL이면 워커 내장 기본값(쿠팡 흰배경 스튜디오) 사용.';
COMMENT ON COLUMN megaload_users.thumbnail_negative_prompt IS
  '로컬 GPU 워커 썸네일 생성용 negative 프롬프트(계정 기본값). NULL이면 워커 내장 기본값 사용.';
