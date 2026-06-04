import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';
import { logSystemError } from '@/lib/utils/system-log';
import { randomBytes } from 'crypto';

export const maxDuration = 20;

// 혼동 문자(0/O, 1/l/I) 제외한 임시 비밀번호 10자리 생성
function genTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/**
 * POST /api/admin/pt-users/[id]/reset-password
 * 관리자가 PT 회원의 비밀번호를 임시값으로 초기화한다.
 *  - service role 로 임시 비밀번호 설정 + user_metadata.must_change_password=true
 *  - 회원은 임시 비번으로 로그인 → 미들웨어가 /my/change-password 로 강제 이동시킴
 *  - 임시 비밀번호는 응답으로만 1회 반환(관리자가 회원에게 전달). DB 평문 저장 안 함.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    // 관리자 권한 확인 (민감 작업 — admin 만 허용)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();

    // 대상 회원 조회 — pt_user id → auth user id(profile_id)
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, profile:profiles(email, full_name)')
      .eq('id', id)
      .single();

    if (!ptUser || !ptUser.profile_id) {
      return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const authUserId = ptUser.profile_id as string;
    const tempPassword = genTempPassword();

    // 기존 user_metadata 보존하며 must_change_password 플래그 병합
    const { data: existing } = await serviceClient.auth.admin.getUserById(authUserId);
    const mergedMeta = {
      ...(existing?.user?.user_metadata || {}),
      must_change_password: true,
    };

    const { error: updErr } = await serviceClient.auth.admin.updateUserById(authUserId, {
      password: tempPassword,
      user_metadata: mergedMeta,
    });

    if (updErr) {
      return NextResponse.json({ error: `초기화 실패: ${updErr.message}` }, { status: 500 });
    }

    // 회원에게 알림(베스트에포트)
    void createNotification(serviceClient, {
      userId: authUserId,
      type: 'system',
      title: '비밀번호가 초기화되었습니다',
      message: '관리자가 비밀번호를 초기화했습니다. 전달받은 임시 비밀번호로 로그인한 뒤, 새 비밀번호를 설정해 주세요.',
      link: '/my/change-password',
    }).catch(() => {});

    const profileRel = ptUser.profile as { email?: string; full_name?: string } | null;
    return NextResponse.json({
      success: true,
      tempPassword,
      email: profileRel?.email || null,
      name: profileRel?.full_name || null,
    });
  } catch (err) {
    console.error('[admin reset-password] error:', err);
    void logSystemError({ source: 'admin/pt-users/reset-password', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
