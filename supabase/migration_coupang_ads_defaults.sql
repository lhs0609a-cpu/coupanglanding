-- 광고 자동화 기본값 재정의 — 실제 목적(매출 안 나는 광고 자동 OFF + 신규상품 자동광고)에 맞춤.
-- 신규 규칙 행에만 적용(기존 저장된 규칙은 유지). 기존 사용자는 웹 UI에서 조정 후 저장하면 반영.
ALTER TABLE megaload_ad_rules
  ALTER COLUMN auto_off_enabled    SET DEFAULT TRUE,   -- ① 매출 안 나는 광고 자동 끄기 기본 켜짐
  ALTER COLUMN off_spend_threshold SET DEFAULT 1200,   -- 광고비 1,200원 쓰고
  ALTER COLUMN auto_register_enabled SET DEFAULT TRUE, -- ② 신규상품 자동광고 기본 켜짐
  ALTER COLUMN register_scope      SET DEFAULT 'all_new'; -- 신규 등록 상품 전체
-- off_max_sales(매출 0 이하면 OFF)·auto_delete_enabled(FALSE)·가드레일 기본값은 유지.

-- ROAS 입찰 자동조정 별도 플래그(기본 꺼짐) — 자동 OFF만 켠 사용자에게 원치 않는 입찰/예산 변경 방지.
-- (기존엔 enabled 규칙이면 무조건 evaluateBid 가 돌아 예산이 바뀌던 문제 차단)
ALTER TABLE megaload_ad_rules
  ADD COLUMN IF NOT EXISTS bid_adjust_enabled BOOLEAN NOT NULL DEFAULT FALSE;
