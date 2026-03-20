import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateApiCredentials } from '@/lib/utils/coupang-api-client';
import { encryptPassword } from '@/lib/utils/encryption';
import { lookupAndLinkTrainee } from '@/lib/utils/trainer-link';
import { logActivity } from '@/lib/utils/activity-log';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, phone, vendorId, accessKey, secretKey } = await request.json();

    // 1. 필수값 검증
    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }

    if (!vendorId || !accessKey || !secretKey) {
      return NextResponse.json({ error: '쿠팡 API 키를 모두 입력해주세요.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = await createServiceClient();

    // 2. 사전등록 확인
    const { data: preReg } = await supabase
      .from('pre_registrations')
      .select('*')
      .eq('status', 'pending')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (!preReg) {
      return NextResponse.json({ error: '사전 등록되지 않은 이메일입니다. 관리자에게 문의해주세요.' }, { status: 403 });
    }

    // 3. 쿠팡 API 키 검증
    const validation = await validateApiCredentials({
      vendorId: vendorId.trim(),
      accessKey: accessKey.trim(),
      secretKey: secretKey.trim(),
    });

    if (!validation.valid) {
      return NextResponse.json({
        error: '쿠팡 API 키가 유효하지 않습니다. Wing에서 키를 다시 확인해주세요.',
        detail: validation.message,
      }, { status: 400 });
    }

    // 4. auth.admin.createUser (이메일 인증 자동 완료)
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || preReg.full_name,
        role: 'pt_user',
        phone: phone || preReg.phone || null,
      },
    });

    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 5. profiles 자동 승인 (is_active = true)
    await supabase
      .from('profiles')
      .update({
        is_active: true,
        phone: phone || preReg.phone || null,
      })
      .eq('id', data.user.id);

    // 6. pt_users INSERT (API 키 암호화 포함)
    const encryptedAccessKey = await encryptPassword(accessKey.trim());
    const encryptedSecretKey = await encryptPassword(secretKey.trim());

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    const { data: ptUser } = await supabase
      .from('pt_users')
      .insert({
        profile_id: data.user.id,
        share_percentage: preReg.share_percentage,
        status: 'active',
        coupang_vendor_id: vendorId.trim(),
        coupang_access_key: encryptedAccessKey,
        coupang_secret_key: encryptedSecretKey,
        coupang_api_connected: true,
        coupang_api_key_expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    // 7. pre_registrations 상태 업데이트
    await supabase
      .from('pre_registrations')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_by_profile_id: data.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', preReg.id);

    // 8. 트레이너 링크 처리
    if (ptUser) {
      await lookupAndLinkTrainee(supabase, {
        userEmail: normalizedEmail,
        ptUserId: ptUser.id,
        profileId: data.user.id,
      });
    }

    // 9. 활동 로그 (사전등록 생성자를 admin으로)
    await logActivity(supabase, {
      adminId: preReg.created_by,
      action: 'auto_approve_user',
      targetType: 'profile',
      targetId: data.user.id,
      details: { email: normalizedEmail, pre_registration_id: preReg.id },
    });

    // 10. 응답
    return NextResponse.json({ success: true, autoApproved: true, userId: data.user.id });
  } catch (err) {
    console.error('signup error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
