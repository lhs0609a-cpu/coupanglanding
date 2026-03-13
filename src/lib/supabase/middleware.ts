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

  // getSession()은 JWT 쿠키를 로컬 디코딩 (네트워크 요청 없음 → 빠름)
  // getUser()는 Supabase 서버에 검증 요청 → Edge에서 타임아웃 원인
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  const pathname = request.nextUrl.pathname;

  // /auth/* → 누구나 접근 가능
  if (pathname.startsWith('/auth')) {
    return supabaseResponse;
  }

  // /my/* → 로그인 필요
  if (pathname.startsWith('/my')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    // role 체크는 JWT의 app_metadata에서 가져오거나, 페이지 레벨에서 처리
    // middleware에서 DB 쿼리 제거 (Edge 타임아웃 방지)
  }

  // /admin/* → 로그인 필요 (세부 role 체크는 페이지에서)
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
