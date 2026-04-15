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

  // refresh 토큰이 무효화된 경우: 스테일 쿠키를 정리해 클라이언트가 재차
  // 자동 refresh를 시도하다 콘솔에 AuthApiError를 뿜는 것을 막는다.
  if (sessionError || !user) {
    // /megaload, /my, /admin 같은 보호 경로만 로그인 강제. 그 외 공개 페이지는 통과.
    const isProtected =
      pathname.startsWith('/my') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/megaload');

    if (!isProtected) {
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    const redirectResponse = NextResponse.redirect(url);

    // 스테일 sb-* 쿠키 전부 삭제 (브라우저가 더 이상 만료된 refresh token을 들고 있지 않도록)
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.delete(cookie.name);
      }
    });

    return redirectResponse;
  }

  return supabaseResponse;
}
