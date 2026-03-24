import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, phone } = await request.json();

    // 1. 필수값 검증
    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = await createServiceClient();

    // 2. auth.admin.createUser (이메일 인증 자동 완료, is_active = false)
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || '',
        role: 'pt_user',
        phone: phone || null,
      },
    });

    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 3. profiles 업데이트 (is_active = false, 관리자 승인 대기)
    await supabase
      .from('profiles')
      .update({
        is_active: false,
        phone: phone || null,
      })
      .eq('id', data.user.id);

    // 4. 활동 로그
    await logActivity(supabase, {
      adminId: data.user.id,
      action: 'user_signup',
      targetType: 'profile',
      targetId: data.user.id,
      details: { email: normalizedEmail },
    });

    // 5. 응답 (관리자 승인 대기)
    return NextResponse.json({ success: true, autoApproved: false, userId: data.user.id });
  } catch (err) {
    console.error('signup error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
