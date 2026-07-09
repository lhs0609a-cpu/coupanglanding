-- 문의(CS) 수집 파이프라인: upsert 충돌 대상 유니크 인덱스
-- 채널→sh_cs_inquiries 수집 시 (megaload_user_id, channel, channel_inquiry_id)로 멱등 upsert.
-- channel_inquiry_id 는 nullable 이므로 부분 유니크(값 있을 때만)로 만들어 NULL 다중행 허용.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sh_cs_inquiries_channel_id
  ON sh_cs_inquiries (megaload_user_id, channel, channel_inquiry_id)
  WHERE channel_inquiry_id IS NOT NULL;

-- 수집 조회 최적화 (inquired_at 최신순)
CREATE INDEX IF NOT EXISTS idx_sh_cs_inquiries_inquired
  ON sh_cs_inquiries (megaload_user_id, inquired_at DESC);
