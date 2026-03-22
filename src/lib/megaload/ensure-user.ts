import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptPassword } from '@/lib/utils/encryption';

/**
 * megaload_users 조회 → 없으면 pt_users에서 자동 프로비저닝
 *
 * 1) megaload_users 확인
 * 2) 없으면 pt_users에서 쿠팡 API 키 확인
 * 3) megaload_users 생성 + channel_credentials 생성
 * 4) megaload_user_id 반환
 */
export async function ensureMegaloadUser(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  profileId: string
): Promise<string> {
  // 1) 기존 megaload_users 확인
  const { data: existing, error: existingErr } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (existing) return (existing as Record<string, unknown>).id as string;

  // 2) pt_users에서 쿠팡 연동 정보 확인
  const { data: ptUser, error: ptErr } = await serviceClient
    .from('pt_users')
    .select('coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
    .eq('profile_id', profileId)
    .single();

  if (!ptUser?.coupang_api_connected || !ptUser.coupang_vendor_id) {
    throw new Error('Megaload 계정이 없고, 쿠팡 API도 연동되지 않았습니다.');
  }

  // 3) megaload_users 자동 생성
  const { data: newUser, error: createErr } = await serviceClient
    .from('megaload_users')
    .insert({ profile_id: profileId, plan: 'free', onboarding_done: false })
    .select('id')
    .single();

  if (createErr || !newUser) {
    throw new Error(`Megaload 계정 자동 생성 실패: ${createErr?.message || '알 수 없는 오류'}`);
  }

  const megaloadUserId = (newUser as Record<string, unknown>).id as string;

  // 4) 쿠팡 credentials 복호화 후 channel_credentials 생성
  if (ptUser.coupang_access_key && ptUser.coupang_secret_key) {
    const accessKey = await decryptPassword(ptUser.coupang_access_key);
    const secretKey = await decryptPassword(ptUser.coupang_secret_key);

    await serviceClient.from('channel_credentials').upsert({
      megaload_user_id: megaloadUserId,
      channel: 'coupang',
      credentials: {
        vendorId: ptUser.coupang_vendor_id,
        accessKey,
        secretKey,
      },
      is_connected: true,
      last_verified_at: new Date().toISOString(),
    }, { onConflict: 'megaload_user_id,channel' });
  }

  return megaloadUserId;
}
