-- 쿠팡 셀러 계정 정보 컬럼 추가
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_seller_id TEXT DEFAULT NULL;
ALTER TABLE pt_users ADD COLUMN IF NOT EXISTS coupang_seller_pw TEXT DEFAULT NULL;

-- RLS: 본인만 자기 계정 정보 읽기/쓰기
CREATE POLICY "Users can view own coupang credentials"
  ON pt_users FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can update own coupang credentials"
  ON pt_users FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
