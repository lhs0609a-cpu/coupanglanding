import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import crypto from 'node:crypto';

export const maxDuration = 30;

/**
 * POST /api/megaload/desktop/auth/self-issue
 * 데스크탑 도우미가 "로그인 세션(Supabase user access_token)" 만으로 64자 인증코드를
 * 자동 발급받는다. → 사용자가 웹에서 코드를 복사해 도우미에 붙여넣는 수동 단계 제거.
 *
 * 도우미는 이미 워커 로그인 세션(.session.json)을 갖고 있으므로 그 JWT 로 본인 인증.
 *   - 멱등: 이미 desktop_app_token 이 있으면 그 값을 그대로 반환(다른 기기 무효화 X).
 *   - 없으면 32바이트(64자 hex) 신규 발급 후 저장.
 *   - desktop_app_last_heartbeat 도 갱신 → 자동 연결 즉시 "도우미 연결됨" 표시 회복.
 *
 * Header: Authorization: Bearer <supabase user access_token>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      return NextResponse.json({ error: 'missing access token' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 500 });
    }

    // 사용자 JWT 로 스코프된 RLS 클라이언트 — getUser(token) 으로 세션 유효성 검증.
    const userClient = createSbClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(accessToken);
    if (userErr || !user) {
      return NextResponse.json({ error: 'invalid or expired session' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(userClient, serviceClient, user.id);

    const { data: shUser } = await serviceClient
      .from('megaload_users')
      .select('desktop_app_token')
      .eq('id', shUserId)
      .single();

    let token = (shUser as { desktop_app_token?: string } | null)?.desktop_app_token || '';
    const now = new Date().toISOString();
    let issued = false;

    // 토큰이 없거나 형식이 깨졌으면 신규 발급. 있으면 재사용(멱등) — 다른 기기 무효화 방지.
    if (!token || token.length !== 64) {
      token = crypto.randomBytes(32).toString('hex');
      const { error } = await serviceClient
        .from('megaload_users')
        .update({ desktop_app_token: token, desktop_app_token_issued_at: now, updated_at: now })
        .eq('id', shUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      issued = true;
    }

    // 자동 연결 시점도 "마지막 접속" 으로 기록 → 배너 즉시 회복.
    await serviceClient
      .from('megaload_users')
      .update({ desktop_app_last_heartbeat: now })
      .eq('id', shUserId);

    return NextResponse.json({ token, megaloadUserId: shUserId, issued, auto: true });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
