import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encryptPassword } from '@/lib/utils/encryption';
import { validateApiCredentials } from '@/lib/utils/coupang-api-client';

/** POST: API 자격증명 저장 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { vendorId, accessKey, secretKey, validate } = body as {
      vendorId: string;
      accessKey: string;
      secretKey: string;
      validate?: boolean;
    };

    if (!vendorId || !accessKey || !secretKey) {
      return NextResponse.json({ error: 'vendorId, accessKey, secretKey는 필수입니다.' }, { status: 400 });
    }

    // 유효성 검증 요청인 경우
    if (validate) {
      const result = await validateApiCredentials({ vendorId, accessKey, secretKey });
      return NextResponse.json(result);
    }

    // API 키 암호화
    const encryptedAccessKey = await encryptPassword(accessKey);
    const encryptedSecretKey = await encryptPassword(secretKey);

    // 6개월 후 만료일 설정
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    // Service client로 RLS bypass하여 업데이트 (유저 인증은 위에서 완료)
    const serviceClient = await createServiceClient();
    const { error: updateError } = await serviceClient
      .from('pt_users')
      .update({
        coupang_vendor_id: vendorId,
        coupang_access_key: encryptedAccessKey,
        coupang_secret_key: encryptedSecretKey,
        coupang_api_connected: true,
        coupang_api_key_expires_at: expiresAt.toISOString(),
      })
      .eq('profile_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: '자격증명 저장에 실패했습니다.' }, { status: 500 });
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

/** GET: 자격증명 존재 여부 + 만료일 조회 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('coupang_vendor_id, coupang_api_connected, coupang_api_key_expires_at')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      hasCredentials: !!ptUser.coupang_api_connected,
      vendorId: ptUser.coupang_vendor_id || null,
      expiresAt: ptUser.coupang_api_key_expires_at || null,
    });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
