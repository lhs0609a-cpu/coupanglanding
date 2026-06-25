-- 교육용 영상 (YouTube 임베드)
-- 영상 파일은 YouTube에 호스팅, DB는 메타데이터만 보관
CREATE TABLE IF NOT EXISTS training_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  youtube_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_videos_published
  ON training_videos(is_published, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_videos_category
  ON training_videos(category, sort_order);

ALTER TABLE training_videos ENABLE ROW LEVEL SECURITY;

-- 로그인한 사용자는 발행된 영상만 조회
DROP POLICY IF EXISTS "training_videos_select_published" ON training_videos;
CREATE POLICY "training_videos_select_published" ON training_videos
  FOR SELECT
  TO authenticated
  USING (is_published = true);

-- 관리자는 모든 행 조작 가능
DROP POLICY IF EXISTS "training_videos_admin_all" ON training_videos;
CREATE POLICY "training_videos_admin_all" ON training_videos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
