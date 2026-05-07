-- 방금 등록한 카드가 실제로 DB에 들어갔는지 확인
SELECT
  bc.id,
  bc.pt_user_id,
  bc.card_company,
  bc.card_number,
  bc.is_active,
  bc.is_primary,
  bc.registered_at,
  bc.created_at,
  pu.profile_id,
  p.email
FROM billing_cards bc
JOIN pt_users pu ON pu.id = bc.pt_user_id
LEFT JOIN profiles p ON p.id = pu.profile_id
WHERE bc.created_at > now() - interval '1 hour'
ORDER BY bc.created_at DESC
LIMIT 10;
