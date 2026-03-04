-- 기본(정적) 가이드 이미지 숨김 테이블
CREATE TABLE IF NOT EXISTS public.hidden_guide_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  image_index INTEGER NOT NULL,
  hidden_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(article_id, step_index, image_index)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_hidden_guide_images_article
  ON public.hidden_guide_images (article_id);

-- RLS
ALTER TABLE public.hidden_guide_images ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능
CREATE POLICY "hidden_guide_images_select" ON public.hidden_guide_images
  FOR SELECT USING (true);

-- admin만 INSERT 가능
CREATE POLICY "hidden_guide_images_insert" ON public.hidden_guide_images
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- admin만 DELETE 가능
CREATE POLICY "hidden_guide_images_delete" ON public.hidden_guide_images
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
