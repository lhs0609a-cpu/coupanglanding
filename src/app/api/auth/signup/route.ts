import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    // Service role로 유저 생성 → 이메일 인증 자동 완료
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || '',
        role: 'pt_user',
      },
    });

    if (error) {
      // 이미 가입된 이메일인 경우: 이메일 미인증 유저라면 인증 처리 후 비밀번호 갱신
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        // 기존 유저 조회
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existingUser = listData?.users?.find((u) => u.email === email);

        if (existingUser && !existingUser.email_confirmed_at) {
          // 미인증 유저 → 이메일 인증 + 비밀번호 업데이트
          await supabase.auth.admin.updateUserById(existingUser.id, {
            email_confirm: true,
            password,
            user_metadata: {
              full_name: fullName || existingUser.user_metadata?.full_name || '',
              role: 'pt_user',
            },
          });
          return NextResponse.json({ success: true, userId: existingUser.id });
        }

        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: data.user.id });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
