-- ============================================================
-- 쿠팡 라이브 attribute 이름 ↔ 우리 buyOption 이름 매핑 학습 테이블
--
-- 문제:
--   우리 로컬 buyOption 이름("개당 중량")과 쿠팡 라이브 API 의 실제 attributeTypeName
--   ("내용량(g)", "포장중량" 등)이 카테고리마다 다름. 매처가 이름 매칭 실패하면
--   default "1g x 1개" 로 잘못 등록됨.
--
-- 해결:
--   카테고리별로 한 번 매칭 성공하면(unit + dataType 기반 fallback) 이 매핑을
--   학습 저장. 다음 등록 시 즉시 alias 로 정확 매칭.
--
-- 운영:
--   - 빌더 가 매칭 성공 시마다 upsert (hit_count 증가).
--   - cron 으로 주 1회 자주 쓰는 카테고리 attribute 동기화 (optional 강화).
-- ============================================================

CREATE TABLE IF NOT EXISTS coupang_attribute_alias (
  category_code TEXT NOT NULL,
  buy_option_name TEXT NOT NULL,                     -- 우리 로컬 이름 (예: "개당 중량")
  buy_option_unit TEXT NOT NULL DEFAULT '',          -- 단위 (예: "g", "개", "ml")
  attribute_type_name TEXT NOT NULL,                 -- 쿠팡 라이브 attributeTypeName (예: "내용량(g)")
  data_type TEXT,                                    -- NUMBER / TEXT / STRING / ENUM
  basic_unit TEXT,
  hit_count INTEGER NOT NULL DEFAULT 1,
  first_matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category_code, buy_option_name, buy_option_unit)
);

CREATE INDEX IF NOT EXISTS idx_attr_alias_cat ON coupang_attribute_alias(category_code);
CREATE INDEX IF NOT EXISTS idx_attr_alias_recent ON coupang_attribute_alias(last_used_at DESC);

-- service_role 만 쓰기, authenticated 는 읽기 (필요 시)
ALTER TABLE coupang_attribute_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_attr_alias" ON coupang_attribute_alias
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- alias upsert + hit_count 증가 RPC
CREATE OR REPLACE FUNCTION upsert_attribute_alias(
  p_category_code TEXT,
  p_buy_option_name TEXT,
  p_buy_option_unit TEXT,
  p_attribute_type_name TEXT,
  p_data_type TEXT,
  p_basic_unit TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO coupang_attribute_alias (
    category_code, buy_option_name, buy_option_unit,
    attribute_type_name, data_type, basic_unit
  ) VALUES (
    p_category_code, p_buy_option_name, COALESCE(p_buy_option_unit, ''),
    p_attribute_type_name, p_data_type, p_basic_unit
  )
  ON CONFLICT (category_code, buy_option_name, buy_option_unit) DO UPDATE
  SET hit_count = coupang_attribute_alias.hit_count + 1,
      last_used_at = now(),
      attribute_type_name = EXCLUDED.attribute_type_name,
      data_type = COALESCE(EXCLUDED.data_type, coupang_attribute_alias.data_type),
      basic_unit = COALESCE(EXCLUDED.basic_unit, coupang_attribute_alias.basic_unit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION upsert_attribute_alias TO service_role;
