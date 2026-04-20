-- 쿠팡 API 자동 매출 집계 스냅샷 테이블
-- PT생이 API를 연동하면 크론이 주기적으로 혁신 → 관리자 매출 현황/PT생 성과에 "잠정" 표시로 노출
-- monthly_reports(확정)와 별도 유지해 PT생 수동 제출과 충돌 방지

CREATE TABLE IF NOT EXISTS api_revenue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  total_sales NUMERIC NOT NULL DEFAULT 0,
  total_commission NUMERIC NOT NULL DEFAULT 0,
  total_shipping NUMERIC NOT NULL DEFAULT 0,
  total_returns NUMERIC NOT NULL DEFAULT 0,
  total_settlement NUMERIC NOT NULL DEFAULT 0,
  item_count INT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pt_user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_api_revenue_snapshots_year_month
  ON api_revenue_snapshots (year_month);

CREATE INDEX IF NOT EXISTS idx_api_revenue_snapshots_pt_user
  ON api_revenue_snapshots (pt_user_id);

CREATE INDEX IF NOT EXISTS idx_api_revenue_snapshots_synced_at
  ON api_revenue_snapshots (synced_at DESC);

-- RLS
ALTER TABLE api_revenue_snapshots ENABLE ROW LEVEL SECURITY;

-- 관리자는 전체 조회 가능
CREATE POLICY "Admins can read all api_revenue_snapshots"
  ON api_revenue_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- PT생은 자기 데이터만 조회
CREATE POLICY "PT users can read own api_revenue_snapshots"
  ON api_revenue_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pt_users
      WHERE pt_users.id = api_revenue_snapshots.pt_user_id
        AND pt_users.profile_id = auth.uid()
    )
  );

-- 쓰기는 service_role(크론)만 — 별도 정책 생성하지 않음으로써 차단
