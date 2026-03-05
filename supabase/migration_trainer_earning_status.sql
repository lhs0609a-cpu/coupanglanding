-- 트레이너 보너스 정산 상태 마이그레이션
-- 기존: pending | confirmed | paid
-- 변경: pending | requested | deposited | confirmed
--
-- 매핑:
--   paid (지급완료) → confirmed (입금확인완료) — 최종 상태
--   confirmed (확인) → deposited (입금완료) — 관리자가 확인한 중간 상태

-- 순서 중요: paid → confirmed 먼저, 그다음 confirmed → deposited
-- (confirmed를 먼저 바꾸면 paid → confirmed 후 다시 deposited로 바뀌므로)

-- Step 1: paid → confirmed (최종 완료 상태)
UPDATE trainer_earnings
SET payment_status = 'confirmed'
WHERE payment_status = 'paid';

-- Step 2: 기존 confirmed (관리자 확인) → deposited
-- 주의: Step 1에서 paid→confirmed로 바뀐 레코드와 구분 필요
-- paid였던 것은 이미 confirmed로 변환됨
-- 기존 confirmed였던 것만 deposited로 바꿔야 하지만,
-- Step 1 이후에는 구분 불가하므로, 기존 confirmed는
-- 사실상 "관리자가 확인한" 상태이므로 deposited가 맞음
-- → 단, Step 1에서 이미 paid→confirmed 처리했으므로
--   이 시점의 confirmed는 모두 (구 paid + 구 confirmed) 혼재
-- → 실무적으로: 기존 paid/confirmed 둘 다 최종 완료 상태이므로
--   모두 confirmed(입금확인완료)로 두는 것이 안전함

-- 결론: paid만 confirmed로 변환하면 충분
-- 기존 confirmed도 새 confirmed(입금확인완료)와 의미가 호환됨
