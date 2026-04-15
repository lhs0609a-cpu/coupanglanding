import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Supabase 환경변수가 없으면 미들웨어 건너뛰기
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Record<string, unknown>)
          );
        },
      },
    }
  );

  // getSession()은 access token이 유효할 땐 로컬 JWT 디코딩만 하고,
  // 만료 직전이면 refresh token으로 갱신한 뒤 setAll로 새 쿠키를 응답에 심는다.
  // refresh가 실패하면 session은 null, error에 "refresh_token_not_found"가 담긴다.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  const pathname = request.nextUrl.pathname;

  // /auth/* → 누구나 접근 가능 (refresh 실패도 무시 — 로그인 페이지 자체는 열려야 함)
  if (pathname.startsWith('/auth')) {
    return supabaseResponse;
  }

  const isApiRoute = pathname.startsWith('/api/');

  // refresh 토큰이 무효화된 경우: 스테일 쿠키를 정리해 클라이언트가 재차
  // 자동 refresh를 시도하다 콘솔에 AuthApiError를 뿜는 것을 막는다.
  if (sessionError || !user) {
    // /megaload, /my, /admin 같은 보호 경로만 로그인 강제. 그 외 공개 페이지는 통과.
    const isProtected =
      pathname.startsWith('/my') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/megaload') ||
      isApiRoute;

    if (!isProtected) {
      return supabaseResponse;
    }

    // API 라우트는 리다이렉트 대신 401 JSON 반환 (fetch 클라이언트가 처리)
    if (isApiRoute) {
      return jsonResponse(401, { error: '인증 필요' });
    }

    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    const redirectResponse = NextResponse.redirect(url);

    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.delete(cookie.name);
      }
    });

    return redirectResponse;
  }

  // ─── 결제 락 가드 (메가로드 mutation API) ─────────────────────────
  // /api/megaload/* 의 POST/PUT/PATCH/DELETE 요청만 검사. GET/HEAD는 조회이므로 통과.
  // L1+: bulk-register 차단 / L2+: 모든 쓰기 차단 / L3+: 모든 쓰기 차단(이미 페이지 단에서 리다이렉트되지만 API도 방어)
  if (
    pathname.startsWith('/api/megaload/') &&
    isMutationMethod(request.method)
  ) {
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('payment_lock_level, payment_lock_exempt_until')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (ptUser) {
      const today = new Date().toISOString().slice(0, 10);
      const exemptActive =
        ptUser.payment_lock_exempt_until && ptUser.payment_lock_exempt_until > today;
      const level = exemptActive ? 0 : (ptUser.payment_lock_level ?? 0);

      const isMajorWrite = pathname.includes('/bulk-register/');
      const blocked =
        level >= 2 || (level >= 1 && isMajorWrite);

      if (blocked) {
        return jsonResponse(423, {
          error: '결제 미이행으로 서비스가 일시 제한되었습니다',
          code: 'PAYMENT_LOCKED',
          lockLevel: level,
          link: '/my/settings',
        });
      }
    }
  }

  return supabaseResponse;
}

function isMutationMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function jsonResponse(status: number, body: Record<string, unknown>): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
