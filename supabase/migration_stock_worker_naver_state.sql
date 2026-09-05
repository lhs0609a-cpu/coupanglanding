-- 도우미 하트비트에 "네이버 로그인 상태"를 싣는다.
-- ---------------------------------------------------------------------------
-- 왜 필요한가(실측 2026-08-19):
--   품절 감시는 셀러 각자의 PC 가 **자기 네이버 계정으로 자기 상품만** 확인하는 구조다.
--   그래서 로그인 안 한 셀러의 스마트스토어 상품은 아무도 못 본다(감시 대상의 72%가 스마트스토어).
--   그런데 서버는 누가 로그인했는지 알 방법이 없었다 — "스마트스토어가 성공했으니 로그인했겠지"로
--   역추론하는 수밖에 없었고, 그래서 "누구에게 로그인하라고 안내할지"조차 고를 수 없었다.
--
-- ★ 계정 정보는 오지 않는다. 참/거짓 세 개뿐이다(아이디도, 비밀번호도 서버로 보내지 않는다).
--   도우미는 쿠키 존재 여부로 판정하므로 네이버 요청이 0회다 — 자주 보내도 비용이 없다.
alter table megaload_worker_heartbeats
  -- 지금 네이버에 로그인돼 있는가(NID_AUT/NID_SES 쿠키 존재)
  add column if not exists naver_logged_in boolean,
  -- 그 로그인이 앱 재시작을 견디는가. "로그인 상태 유지"를 끄면 세션 쿠키라 앱을 끄면 풀린다.
  --   로그인 여부와 원인이 다르므로 따로 본다(관리자 화면이 "유지 / 세션만"을 구분해 보여준다).
  add column if not exists naver_persistent boolean,
  -- 자동 로그인 계정이 저장돼 있는가(비밀번호는 그 PC 의 OS 암호저장소에만 있다).
  --   저장돼 있으면 세션이 끊겨도 스스로 복구하므로 안내 대상에서 뺄 수 있다.
  add column if not exists naver_credential boolean,
  add column if not exists naver_checked_at timestamptz;

comment on column megaload_worker_heartbeats.naver_logged_in is
  '도우미 PC 가 네이버에 로그인돼 있는지(쿠키 판정). 계정 정보는 저장하지 않는다.';
comment on column megaload_worker_heartbeats.naver_persistent is
  '영구 쿠키인지. false 면 앱 재시작 시 로그인이 풀린다("로그인 상태 유지" 미사용).';
comment on column megaload_worker_heartbeats.naver_credential is
  '자동 로그인 계정 저장 여부. 비밀번호는 그 PC 의 OS 암호저장소에만 있다.';

-- 관리자 현황판이 "로그인 안 된 도우미"를 바로 뽑는다.
create index if not exists idx_worker_heartbeats_naver
  on megaload_worker_heartbeats (naver_logged_in, last_seen desc);
