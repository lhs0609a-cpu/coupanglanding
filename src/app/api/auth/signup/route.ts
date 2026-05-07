import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30; // hang 시 비용 폭증 방지

/** Promise에 timeout을 강제 부여 — 어느 단계에서 hang인지 표면화 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    p.then(v => { clearTimeout(tid); resolve(v); })
     .catch(e => { clearTimeout(tid); reject(e); });
  });
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const tlog = (label: string) => console.log(`[signup] ${label} +${Date.now() - t0}ms`);
  try {
    const { email, password, fullName, phone } = await request.json();
    tlog('parsed body');

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다. (예: name@domain.com)' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = await createServiceClient();
    tlog('service client created');

    // 2. auth.admin.createUser — 12초 timeout (Supabase 정상 시 1~2초)
    let created;
    try {
      created = await withTimeout(
        supabase.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName || '',
            role: 'pt_user',
            phone: phone || null,
          },
        }),
        12_000,
        'createUser',
      );
    } catch (e) {
      tlog(`createUser TIMEOUT: ${e instanceof Error ? e.message : String(e)}`);
      return NextResponse.json({
        error: 'Supabase 응답 지연 (createUser 12초 초과). 트리거/RLS 점검 필요.',
      }, { status: 504 });
    }
    const { data, error } = created;
    tlog(`createUser done (error=${error?.message || 'none'})`);

    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 3. profiles update — 8초 timeout (트리거 hang 차단)
    try {
      const upd = await withTimeout<{ error: { message: string } | null }>(
        Promise.resolve(supabase.from('profiles').update({
          is_active: false,
          phone: phone || null,
        }).eq('id', data.user.id)),
        8_000,
        'profiles update',
      );
      tlog(`profiles update done (error=${upd.error?.message || 'none'})`);
    } catch (e) {
      // profiles update가 실패/timeout 해도 user는 이미 생성됨 → 계속 진행
      tlog(`profiles update TIMEOUT/FAIL: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4. 활동 로그 — fire-and-forget (응답 차단 안 함)
    logActivity(supabase, {
      adminId: data.user.id,
      action: 'user_signup',
      targetType: 'profile',
      targetId: data.user.id,
      details: { email: normalizedEmail },
    }).then(() => tlog('activity log done')).catch(e => tlog(`activity log failed: ${e instanceof Error ? e.message : String(e)}`));

    tlog('returning success');
    return NextResponse.json({ success: true, autoApproved: false, userId: data.user.id });
  } catch (err) {
    console.error('signup error:', err);
    void logSystemError({ source: 'auth/signup', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
