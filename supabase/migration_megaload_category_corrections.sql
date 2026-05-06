-- ============================================================
-- 메가로드 카테고리 매칭 교정 학습 테이블
--
-- 사용자가 수동으로 카테고리를 수정한 케이스를 저장.
-- 다음 등록 시 같은 사용자의 비슷한 상품명 패턴 → 학습 결과 즉시 적용.
--
-- 매칭 흐름:
--   1. 매칭 직전 → 이 테이블 조회 (signature 기반)
--   2. 학습 결과 있으면 → 즉시 사용 (로컬/AI 매칭 스킵)
--   3. 없으면 → 기존 매칭 흐름
--   4. 사용자가 수정하면 → 이 테이블에 저장 (upsert)
--
-- signature: 정규화된 상품명 토큰 시그니처 (정렬+중복제거+해시)
-- ============================================================

CREATE TABLE IF NOT EXISTS megaload_category_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  megaload_user_id UUID NOT NULL REFERENCES megaload_users(id) ON DELETE CASCADE,

  -- 토큰 시그니처: 상품명 토큰을 정렬+중복제거+해시한 키
  -- 같은 시그니처 = 비슷한 상품 (토큰 순서 무관)
  product_signature TEXT NOT NULL,

  -- 정확한 코드 (사용자가 선택한 정답)
  corrected_code TEXT NOT NULL,
  corrected_path TEXT NOT NULL,

  -- 교정 전 매칭 결과 (오매칭 패턴 분석용)
  original_code TEXT,
  original_path TEXT,
  original_confidence REAL,

  -- 진단 메타
  product_name_sample TEXT NOT NULL, -- 원본 상품명 샘플 (디버깅용)
  hit_count INTEGER NOT NULL DEFAULT 1, -- 같은 시그니처가 재사용된 횟수

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 한 사용자의 같은 시그니처는 1개만 (upsert 키)
  UNIQUE(megaload_user_id, product_signature)
);

-- 빠른 조회용 인덱스 (조회 시 user_id + signature 로 lookup)
CREATE INDEX IF NOT EXISTS idx_category_corrections_user_sig
  ON megaload_category_corrections(megaload_user_id, product_signature);

-- 갱신 추적용
CREATE INDEX IF NOT EXISTS idx_category_corrections_updated
  ON megaload_category_corrections(updated_at);

-- RLS: 본인 데이터만 read/write
ALTER TABLE megaload_category_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select_own_category_corrections"
  ON megaload_category_corrections FOR SELECT
  USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "user_insert_own_category_corrections"
  ON megaload_category_corrections FOR INSERT
  WITH CHECK (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "user_update_own_category_corrections"
  ON megaload_category_corrections FOR UPDATE
  USING (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  ) WITH CHECK (
    megaload_user_id IN (
      SELECT id FROM megaload_users WHERE profile_id = auth.uid()
    )
  );

-- service_role 은 admin 작업용 전체 접근
CREATE POLICY "service_role_all_category_corrections"
  ON megaload_category_corrections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE megaload_category_corrections IS
  '메가로드 카테고리 매칭 학습 — 사용자 수동 수정 케이스 저장하여 다음 매칭 시 즉시 적용';
