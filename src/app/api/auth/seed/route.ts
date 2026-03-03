import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_EMAIL = 'lhs0609a@gmail.com';
const ADMIN_PASSWORD = 'lhs0609a@gmail.com';

export async function POST() {
  try {
    const supabase = await createServiceClient();

    // 이미 존재하는지 확인
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingAdmin = listData?.users?.find((u) => u.email === ADMIN_EMAIL);

    if (existingAdmin) {
      // 이미 존재하면 role을 admin으로, is_active를 true로 보장
      await supabase.auth.admin.updateUserById(existingAdmin.id, {
        email_confirm: true,
        user_metadata: { full_name: '관리자', role: 'admin' },
      });
      await supabase.from('profiles').update({ role: 'admin', is_active: true }).eq('id', existingAdmin.id);
      return NextResponse.json({ success: true, message: '관리자 계정이 이미 존재합니다. 권한을 업데이트했습니다.' });
    }

    // 관리자 계정 생성
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: '관리자', role: 'admin' },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // profiles에 admin role + is_active 설정
    await supabase.from('profiles').update({ role: 'admin', is_active: true }).eq('id', data.user.id);

    return NextResponse.json({ success: true, message: '관리자 계정이 생성되었습니다.' });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
