-- 쿠팡 카테고리 attribute 응답 캐시
-- displayCategoryCode → getCategoryAttributes 라이브 응답
-- 카테고리는 공통 자산이므로 user-agnostic (전체 사용자 공유)
-- notice_category_cache 와 동일 패턴

CREATE TABLE IF NOT EXISTS coupang_attribute_cache (
  category_code TEXT PRIMARY KEY,
  -- 응답 그대로 저장: [{ attributeTypeName, required, dataType, exposed, groupNumber, attributeValues }, ...]
  attributes JSONB NOT NULL,
  -- 진단용 메타
  source TEXT NOT NULL DEFAULT 'live_api',  -- 'live_api' | 'manual_seed'
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- API 응답이 빈 배열이었던 경우 (해당 카테고리 속성 없음)
  is_empty BOOLEAN NOT NULL DEFAULT FALSE
);

-- 갱신용 인덱스
CREATE INDEX IF NOT EXISTS idx_attr_cache_updated
  ON coupang_attribute_cache (updated_at);

-- RLS: 모든 인증 사용자 read, service_role write (notice_category_cache 와 동일)
ALTER TABLE coupang_attribute_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attribute_cache_read_authenticated"
  ON coupang_attribute_cache FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "attribute_cache_write_service_role"
  ON coupang_attribute_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE coupang_attribute_cache IS
  '쿠팡 카테고리 attribute API 응답 캐시 — 카테고리당 1회 라이브 호출 후 영속 공유';
