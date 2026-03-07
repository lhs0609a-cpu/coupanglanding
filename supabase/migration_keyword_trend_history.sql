-- ============================================================
-- 키워드 트렌드 히스토리 캐시 테이블
-- Naver DataLab Shopping Insight API 결과를 캐싱
-- ============================================================

CREATE TABLE IF NOT EXISTS keyword_trend_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  data_points JSONB NOT NULL DEFAULT '[]',
  -- 캐시 관리
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 같은 키워드+기간+날짜 범위는 유니크
  UNIQUE(keyword, period_type, start_date, end_date)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_keyword_trend_keyword ON keyword_trend_history(keyword);
CREATE INDEX IF NOT EXISTS idx_keyword_trend_expires ON keyword_trend_history(expires_at);
CREATE INDEX IF NOT EXISTS idx_keyword_trend_lookup ON keyword_trend_history(keyword, period_type, start_date, end_date);

-- RLS 활성화
ALTER TABLE keyword_trend_history ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 읽기 가능
CREATE POLICY "keyword_trend_history_select" ON keyword_trend_history
  FOR SELECT TO authenticated USING (true);

-- 서비스 역할만 쓰기 가능 (API 라우트에서 service_role 키 사용)
CREATE POLICY "keyword_trend_history_insert" ON keyword_trend_history
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "keyword_trend_history_update" ON keyword_trend_history
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "keyword_trend_history_delete" ON keyword_trend_history
  FOR DELETE TO service_role USING (true);

-- 만료된 캐시 자동 정리 (수동 실행 또는 pg_cron 등록)
-- SELECT delete FROM keyword_trend_history WHERE expires_at < NOW();
