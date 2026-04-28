-- 쿠팡 상품정보제공고시 카테고리 응답 캐시
-- displayCategoryCode → 쿠팡 API가 반환한 noticeCategories 전체 응답
-- 첫 호출 시 라이브 API → 캐시 → 이후 라이브 호출 생략
-- 카테고리는 공통 자산이므로 user-agnostic (전체 사용자 공유)

CREATE TABLE IF NOT EXISTS coupang_notice_category_cache (
  category_code TEXT PRIMARY KEY,
  -- 응답 그대로 저장: [{ noticeCategoryName, fields: [{ name, required }] }, ...]
  notice_categories JSONB NOT NULL,
  -- 진단용 메타
  source TEXT NOT NULL DEFAULT 'live_api',  -- 'live_api' | 'manual_seed'
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- API 응답이 빈 배열이었던 경우 (해당 카테고리 노출고시 없음)
  is_empty BOOLEAN NOT NULL DEFAULT FALSE
);

-- 갱신용 인덱스
CREATE INDEX IF NOT EXISTS idx_notice_cache_updated
  ON coupang_notice_category_cache (updated_at);

-- RLS: 모든 인증 사용자 read, service_role write
ALTER TABLE coupang_notice_category_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notice_cache_read_authenticated"
  ON coupang_notice_category_cache FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "notice_cache_write_service_role"
  ON coupang_notice_category_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE coupang_notice_category_cache IS
  '쿠팡 상품정보제공고시 카테고리 API 응답 캐시 — 룰 추론 대신 진짜 정답 사용';
