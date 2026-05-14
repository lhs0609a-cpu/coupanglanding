import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import crypto from 'node:crypto';

export const maxDuration = 30;

/**
 * POST /api/megaload/desktop/auth/issue
 * 웹에서 로그인된 사용자가 데스크탑 앱용 영구 토큰 발급 요청.
 *
 * 흐름:
 *   1. 사용자가 웹에 로그인 → 데스크탑 앱 다운로드 페이지에서 "토큰 발급" 클릭
 *   2. 32바이트 random token 생성 + Supabase megaload_users 에 저장
 *   3. QR 코드 또는 텍스트로 사용자에게 표시
 *   4. 사용자가 데스크탑 앱 첫 실행 시 토큰 입력 → 인증 완료
 *
 * 보안:
 *   - 토큰은 한 번 발급되면 7일 후 만료 (재발급 가능)
 *   - 토큰 사용 후에도 유지됨 (앱이 계속 사용)
 *   - 사용자가 웹에서 "토큰 폐기" 가능 (도난 시)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action;

    if (action === 'revoke') {
      // 토큰 폐기 (도난 / 다른 PC 이전 시)
      const { error } = await serviceClient
        .from('megaload_users')
        .update({
          desktop_app_token: null,
          desktop_app_token_issued_at: null,
          desktop_app_last_heartbeat: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ revoked: true });
    }

    // 신규 토큰 발급 (32바이트 → 64자 hex)
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const { error } = await serviceClient
      .from('megaload_users')
      .update({
        desktop_app_token: token,
        desktop_app_token_issued_at: now,
        updated_at: now,
      })
      .eq('id', shUserId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      token,
      issuedAt: now,
      megaloadUserId: shUserId,
      userEmail: user.email,
      // 7일 만료 안내 (서버에서는 만료 강제 X — 사용자가 직접 폐기)
      expiresHint: '토큰은 7일 동안 유효합니다. 만료 후 재발급 필요.',
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/megaload/desktop/auth
 * 데스크탑 앱이 토큰 유효성 검증 (시작 시 1회 + 24시간 마다).
 * Header: Authorization: Bearer {token}
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length !== 64) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  const { data: shUser, error } = await serviceClient
    .from('megaload_users')
    .select('id, profile_id, desktop_app_token_issued_at')
    .eq('desktop_app_token', token)
    .single();

  if (error || !shUser) {
    return NextResponse.json({ error: 'token not found or revoked' }, { status: 401 });
  }

  // 7일 만료 체크
  const issued = (shUser as { desktop_app_token_issued_at?: string }).desktop_app_token_issued_at;
  if (issued) {
    const ageDays = (Date.now() - new Date(issued).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      return NextResponse.json({ error: 'token expired', expired: true }, { status: 401 });
    }
  }

  // heartbeat 갱신
  await serviceClient
    .from('megaload_users')
    .update({ desktop_app_last_heartbeat: new Date().toISOString() })
    .eq('id', (shUser as { id: string }).id);

  return NextResponse.json({
    valid: true,
    megaloadUserId: (shUser as { id: string }).id,
    profileId: (shUser as { profile_id: string }).profile_id,
  });
}
