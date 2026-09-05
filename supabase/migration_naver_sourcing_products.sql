-- 네이버 소싱 수집물 보관
-- ---------------------------------------------------------------------------
-- 왜 필요한가(실측 2026-08-18): 수집 결과가 **도우미 메모리에만** 있었다. 앱을 껐다 켜면
-- 통째로 사라지고, 도우미가 켜진 그 PC 의 브라우저에서만 보였다. 그래서 관리자가 다른
-- 자리에서 확인할 수도, 셀러가 볼 수도 없었다. 수집은 네이버 예산을 태우는 비싼 작업인데
-- 그 결과가 휘발성이면 같은 걸 계속 다시 긁게 된다.
--
-- 왜 sh_sourcing_products 를 안 쓰나:
--   · platform CHECK 가 ('aliexpress','ali1688') 이라 네이버가 들어갈 자리가 없다
--   · megaload_user_id NOT NULL — 유저별 개인 소싱함 구조다. 이건 관리자가 모아 두고
--     셀러가 함께 보는 **공용 카탈로그**라 소유자가 다르다
-- 억지로 끼우면 두 기능이 서로의 제약에 묶인다. 표를 따로 두는 편이 정직하다.

CREATE TABLE IF NOT EXISTS sh_naver_sourcing_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 네이버 채널상품번호. 같은 상품을 여러 번 수집해도 한 줄이어야 하므로 여기가 정체성이다.
  product_no TEXT NOT NULL,
  -- 원상품번호 — 상세·고시정보 API 가 쓰는 별도 번호(채널상품번호와 다르다).
  origin_product_no TEXT,
  store_id TEXT,
  url TEXT NOT NULL,

  title TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  thumb TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  nv_mid TEXT,

  -- 네이버 카테고리 — id 는 카드가 알려 주고, path 는 관리자가 고른 수집 카테고리 이름이다.
  naver_category_id TEXT,
  category_path TEXT,

  -- 상세 추출 상태. 목록만 있는 줄과 옵션·상세까지 받은 줄을 구분한다.
  detail_status TEXT NOT NULL DEFAULT 'none'
    CHECK (detail_status IN ('none', 'done', 'failed')),
  detail_at TIMESTAMPTZ,
  -- 옵션·고시정보·상세본문 등 추출 결과 원본. 스키마가 네이버 사정으로 바뀌므로 JSONB 로 둔다.
  detail JSONB,
  -- 저장된 이미지 경로/URL 목록 { main: [], detail: [], review: [] }
  images JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 상세 추출 결과가 저장된 로컬 폴더(올인원 입력) — 관리자 PC 기준 경로다.
  folder_path TEXT,

  collected_by UUID REFERENCES megaload_users(id) ON DELETE SET NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 상품을 다시 수집하면 갱신되게 — 재수집 때마다 줄이 늘면 목록이 금방 쓰레기가 된다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_naver_sourcing_product_no
  ON sh_naver_sourcing_products(product_no);
CREATE INDEX IF NOT EXISTS idx_naver_sourcing_category
  ON sh_naver_sourcing_products(naver_category_id);
CREATE INDEX IF NOT EXISTS idx_naver_sourcing_collected_at
  ON sh_naver_sourcing_products(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_naver_sourcing_detail_status
  ON sh_naver_sourcing_products(detail_status);
-- 제목 검색 — 셀러가 카탈로그에서 찾는 주된 방법이다.
CREATE INDEX IF NOT EXISTS idx_naver_sourcing_title
  ON sh_naver_sourcing_products USING gin (to_tsvector('simple', title));

CREATE OR REPLACE FUNCTION touch_naver_sourcing_products()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_naver_sourcing_products ON sh_naver_sourcing_products;
CREATE TRIGGER trg_touch_naver_sourcing_products
  BEFORE UPDATE ON sh_naver_sourcing_products
  FOR EACH ROW EXECUTE FUNCTION touch_naver_sourcing_products();

-- RLS: **읽기는 로그인한 모두**(수집물은 셀러에게 전부 공개하기로 확정),
--      쓰기는 관리자만(수집·상세추출을 도는 주체가 관리자다).
ALTER TABLE sh_naver_sourcing_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS naver_sourcing_read_all ON sh_naver_sourcing_products;
CREATE POLICY naver_sourcing_read_all ON sh_naver_sourcing_products
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS naver_sourcing_write_admin ON sh_naver_sourcing_products;
CREATE POLICY naver_sourcing_write_admin ON sh_naver_sourcing_products
  FOR ALL USING (
    -- 관리자 판정은 profiles.role 이다(megaload_users 에는 role 이 없다 — 실측).
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE sh_naver_sourcing_products IS
  '네이버 소싱 수집물(공용). 관리자가 수집하고 셀러가 함께 본다. 목록만 있는 줄은 detail_status=none.';
