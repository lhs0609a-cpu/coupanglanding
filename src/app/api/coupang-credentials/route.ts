import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encryptPassword, decryptPassword } from '@/lib/utils/encryption';
import { validateApiCredentials } from '@/lib/utils/coupang-api-client';

/** 키를 마스킹: 앞 4자 + **** + 뒤 4자 */
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/** DB에서 기존 암호화된 키를 복호화하여 반환 */
async function getExistingCredentials(profileId: string) {
  const serviceClient = await createServiceClient();
  const { data } = await serviceClient
    .from('pt_users')
    .select('coupang_vendor_id, coupang_access_key, coupang_secret_key')
    .eq('profile_id', profileId)
    .single();

  if (!data?.coupang_access_key || !data?.coupang_secret_key) return null;

  const accessKey = await decryptPassword(data.coupang_access_key);
  const secretKey = await decryptPassword(data.coupang_secret_key);
  return { vendorId: data.coupang_vendor_id, accessKey, secretKey };
}

/** POST: API 자격증명 저장 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { vendorId, wingUserId, accessKey, secretKey, validate, useExisting } = body as {
      vendorId: string;
      wingUserId?: string;
      accessKey?: string;
      secretKey?: string;
      validate?: boolean;
      useExisting?: boolean;
    };

    // 기존 저장된 키를 재사용하는 경우
    let finalAccessKey = accessKey || '';
    let finalSecretKey = secretKey || '';

    if (useExisting && (!finalAccessKey || !finalSecretKey)) {
      const existing = await getExistingCredentials(user.id);
      if (!existing) {
        return NextResponse.json({ error: '저장된 API 키가 없습니다. 새로 입력해주세요.' }, { status: 400 });
      }
      if (!finalAccessKey) finalAccessKey = existing.accessKey;
      if (!finalSecretKey) finalSecretKey = existing.secretKey;
    }

    if (!vendorId || !finalAccessKey || !finalSecretKey) {
      return NextResponse.json({ error: 'vendorId, accessKey, secretKey는 필수입니다.' }, { status: 400 });
    }

    // 유효성 검증 요청인 경우
    if (validate) {
      const result = await validateApiCredentials({ vendorId, accessKey: finalAccessKey, secretKey: finalSecretKey });
      return NextResponse.json(result);
    }

    // API 키 암호화
    const encryptedAccessKey = await encryptPassword(finalAccessKey);
    const encryptedSecretKey = await encryptPassword(finalSecretKey);

    // 6개월 후 만료일 설정
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    // Service client로 RLS bypass하여 업데이트 (유저 인증은 위에서 완료)
    const serviceClient = await createServiceClient();
    const updatePayload: Record<string, unknown> = {
      coupang_vendor_id: vendorId,
      coupang_access_key: encryptedAccessKey,
      coupang_secret_key: encryptedSecretKey,
      coupang_api_connected: true,
      coupang_api_key_expires_at: expiresAt.toISOString(),
    };
    if (wingUserId !== undefined) {
      updatePayload.coupang_wing_user_id = wingUserId.trim() || null;
    }
    const { error: updateError } = await serviceClient
      .from('pt_users')
      .update(updatePayload)
      .eq('profile_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: '자격증명 저장에 실패했습니다.' }, { status: 500 });
    }

    // megaload_users가 있으면 channel_credentials도 동기화 (평문)
    const { data: megaloadUser } = await serviceClient
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (megaloadUser) {
      await serviceClient.from('channel_credentials').upsert({
        megaload_user_id: (megaloadUser as Record<string, unknown>).id as string,
        channel: 'coupang',
        credentials: {
          vendorId,
          accessKey: finalAccessKey,
          secretKey: finalSecretKey,
        },
        is_connected: true,
        last_verified_at: new Date().toISOString(),
      }, { onConflict: 'megaload_user_id,channel' });
    }

    return NextResponse.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `서버 오류: ${message}` }, { status: 500 });
  }
}

/** GET: 자격증명 존재 여부 + 만료일 + 마스킹된 키 미리보기 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // serviceClient로 암호화된 키도 읽기
    const serviceClient = await createServiceClient();
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('coupang_vendor_id, coupang_wing_user_id, coupang_api_connected, coupang_api_key_expires_at, coupang_access_key, coupang_secret_key')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 마스킹된 키 미리보기 생성
    let maskedAccessKey: string | null = null;
    let maskedSecretKey: string | null = null;

    if (ptUser.coupang_access_key && ptUser.coupang_secret_key) {
      try {
        const ak = await decryptPassword(ptUser.coupang_access_key);
        const sk = await decryptPassword(ptUser.coupang_secret_key);
        maskedAccessKey = maskKey(ak);
        maskedSecretKey = maskKey(sk);
      } catch {
        // 복호화 실패 시 마스킹 없이 진행
      }
    }

    return NextResponse.json({
      hasCredentials: !!ptUser.coupang_api_connected,
      vendorId: ptUser.coupang_vendor_id || null,
      wingUserId: ptUser.coupang_wing_user_id || null,
      expiresAt: ptUser.coupang_api_key_expires_at || null,
      maskedAccessKey,
      maskedSecretKey,
    });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
