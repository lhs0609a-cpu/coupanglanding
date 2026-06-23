-- =============================================
-- 멀티채널 전자동 전파 — Phase 3
-- 네이버 등 자체호스팅 채널용 이미지 재호스팅 캐시
--
-- 네이버는 외부 이미지 URL 을 거부 → 등록 전 네이버 이미지서버에 업로드 후 치환 필요.
-- 같은 원본을 매번 재업로드하지 않도록 (source_hash → hosted_url) 캐시.
-- =============================================

CREATE TABLE IF NOT EXISTS sh_channel_image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('coupang','naver','elevenst','gmarket','auction','lotteon','toss','kakao')),
  source_hash TEXT NOT NULL,     -- 원본 URL 의 결정적 해시
  source_url TEXT NOT NULL,
  hosted_url TEXT NOT NULL,      -- 채널이 발급한 URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(megaload_user_id, channel, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_sh_img_assets_lookup
  ON sh_channel_image_assets(megaload_user_id, channel, source_hash);

-- ── RLS ──
ALTER TABLE sh_channel_image_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_rw_own_img_assets" ON sh_channel_image_assets;
CREATE POLICY "user_rw_own_img_assets" ON sh_channel_image_assets
  FOR ALL USING (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  ) WITH CHECK (
    megaload_user_id IN (SELECT id FROM megaload_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_all_img_assets" ON sh_channel_image_assets;
CREATE POLICY "admin_all_img_assets" ON sh_channel_image_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- service_role(크론/러너) 전체 접근
DROP POLICY IF EXISTS "service_all_img_assets" ON sh_channel_image_assets;
CREATE POLICY "service_all_img_assets" ON sh_channel_image_assets
  FOR ALL USING (true) WITH CHECK (true);
