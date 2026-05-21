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
 *   - 영구 토큰: 사용자가 명시적으로 "토큰 폐기" 를 누르거나 새로 발급할 때까지 유효.
 *     (이전: 7일 슬라이딩 만료 → 앱이 며칠 꺼져 있으면 강제 재로그인 발생.
 *      사용자 데이터 정합성 vs. 도난 방어 무게: 도난은 web UI 폐기 + 신규 발급으로 처리.)
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
      // 슬라이딩 만료: 앱이 켜져 있으면 매 검증마다 갱신되어 계속 유효.
      expiresHint: '도우미 앱이 켜져 있으면 계속 유효합니다. 7일 이상 앱을 실행하지 않은 경우에만 재발급이 필요합니다.',
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
  // 토큰 추출: Authorization Bearer 우선, 없으면 ?token= query 폴백
  // (일부 Electron/프록시 환경에서 Authorization 헤더가 전송되지 않는 경우 대응)
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token')?.trim();
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || queryToken;
  if (!token || token.length !== 64) {
    return NextResponse.json({
      error: 'invalid token',
      debug: {
        hasAuthHeader: !!authHeader,
        authHeaderLen: authHeader?.length || 0,
        hasQueryToken: !!queryToken,
        queryTokenLen: queryToken?.length || 0,
        receivedTokenLen: token?.length || 0,
      },
    }, { status: 401 });
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

  // 영구 토큰 — 별도 만료 검사 없음. (도난 시 사용자가 web 에서 명시적 폐기.)
  // heartbeat 만 갱신 — 대시보드 "마지막 접속" 표시용.
  const nowIso = new Date().toISOString();
  await serviceClient
    .from('megaload_users')
    .update({ desktop_app_last_heartbeat: nowIso })
    .eq('id', (shUser as { id: string }).id);

  return NextResponse.json({
    valid: true,
    megaloadUserId: (shUser as { id: string }).id,
    profileId: (shUser as { profile_id: string }).profile_id,
  });
}
