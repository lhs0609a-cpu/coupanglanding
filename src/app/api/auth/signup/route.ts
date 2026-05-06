import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

export const maxDuration = 30; // hang 시 비용 폭증 방지 (Supabase 호출 정상이면 5s 내 응답)

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const tlog = (label: string) => console.log(`[signup] ${label} +${Date.now() - t0}ms`);
  try {
    const { email, password, fullName, phone } = await request.json();
    tlog('parsed body');

    // 1. 필수값 검증
    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }

    // 이메일 형식 기본 검증 (Supabase 가 invalid email 에 대해 hang/지연 응답하는 케이스 차단)
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다. (예: name@domain.com)' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = await createServiceClient();
    tlog('service client created');

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
    tlog(`createUser done (error=${error?.message || 'none'})`);

    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 3. profiles 업데이트 (is_active = false, 관리자 승인 대기)
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        is_active: false,
        phone: phone || null,
      })
      .eq('id', data.user.id);
    tlog(`profiles update done (error=${updateErr?.message || 'none'})`);

    // 4. 활동 로그 (실패해도 회원가입 차단 안 함)
    try {
      await logActivity(supabase, {
        adminId: data.user.id,
        action: 'user_signup',
        targetType: 'profile',
        targetId: data.user.id,
        details: { email: normalizedEmail },
      });
      tlog('activity log done');
    } catch (e) {
      tlog(`activity log failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 5. 응답 (관리자 승인 대기)
    tlog('returning success');
    return NextResponse.json({ success: true, autoApproved: false, userId: data.user.id });
  } catch (err) {
    console.error('signup error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
