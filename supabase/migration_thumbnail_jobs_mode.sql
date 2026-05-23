-- ============================================================
-- megaload_thumbnail_jobs.mode: 처리 방식 구분
--   'cutout'     (기본) — 누끼 + 흰배경 1:1 (상품 픽셀 보존)
--   'regenerate'        — PT 원클릭. 누끼 → 파임 prefill → SDXL img2img(전체 균일 재생성)
--                         → 재누끼 → 흰배경. 잘림/지저분/흐림 대표사진 정리용(생성).
-- claim_thumbnail_jobs 는 RETURNING j.* 이므로 워커가 자동으로 mode 를 받는다(RPC 변경 불필요).
-- ★ 실행: Supabase 대시보드 > SQL Editor 에서 실행
-- ============================================================

ALTER TABLE megaload_thumbnail_jobs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'cutout';

-- 기존 CHECK 가 없으면 추가 (중복 방지 위해 DO 블록)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'megaload_thumbnail_jobs_mode_check'
  ) THEN
    ALTER TABLE megaload_thumbnail_jobs
      ADD CONSTRAINT megaload_thumbnail_jobs_mode_check CHECK (mode IN ('cutout','regenerate'));
  END IF;
END $$;
