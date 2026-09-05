-- 이미 올린 상품 표시 — 조회를 받쳐 주는 인덱스
-- ---------------------------------------------------------------------------
-- 왜 필요한가: 네이버 소싱 카탈로그가 페이지를 넘길 때마다
--   POST /api/megaload/products/bulk-register/registered-codes 로
--   "이 채널상품번호 60개 중 내가 올린 것"을 묻는다. 그 질의의 조건이
--   raw_data->>'productCode' 인데 여기에 인덱스가 없었다 —— megaload_user_id 인덱스로
--   유저 상품까지 좁힌 뒤 나머지를 전부 훑는다. 한 셀러의 등록이 쌓일수록
--   카탈로그가 같이 느려지는 구조다(등록을 많이 한 셀러일수록 더 느려진다 — 거꾸로 됐다).
--
-- 표현식 인덱스라 조건식을 **글자 그대로** 맞춰야 쓰인다: raw_data->>'productCode'.
-- 등록 기록에만 붙는 인덱스라 등록 경로의 INSERT 비용은 무시할 만하다(줄당 1건).
CREATE INDEX IF NOT EXISTS idx_sh_products_user_source_code
  ON sh_products (megaload_user_id, ((raw_data->>'productCode')));
