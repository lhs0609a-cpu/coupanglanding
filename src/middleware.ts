import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Supabase 세션 쿠키 존재 여부만 확인 (네트워크 요청 없음)
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'),
  );

  // /auth/* → 누구나 접근
  if (pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  // /my/*, /admin/* → 쿠키 없으면 로그인 페이지로
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/my/:path*',
    '/admin/:path*',
    '/auth/:path*',
    '/megaload/:path*',
  ],
};
