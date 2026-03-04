-- 가이드 스텝 이미지 관리 테이블
CREATE TABLE IF NOT EXISTS public.guide_step_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_guide_step_images_article
  ON public.guide_step_images (article_id, step_index, display_order);

-- RLS
ALTER TABLE public.guide_step_images ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능
CREATE POLICY "guide_step_images_select" ON public.guide_step_images
  FOR SELECT USING (true);

-- admin만 쓰기 가능
CREATE POLICY "guide_step_images_insert" ON public.guide_step_images
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "guide_step_images_delete" ON public.guide_step_images
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Storage 버킷 (Supabase Dashboard에서 수동 생성 필요)
-- 버킷 이름: guide-images
-- Public: true
