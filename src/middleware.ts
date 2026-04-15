import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // updateSession: access token이 만료되면 refresh 토큰으로 갱신해 쿠키를 다시 심고,
  // refresh가 실패하면 스테일 쿠키를 정리한 뒤 /auth/login으로 리다이렉트.
  return updateSession(request);
}

export const config = {
  matcher: [
    '/my/:path*',
    '/admin/:path*',
    '/auth/:path*',
    '/megaload/:path*',
    '/api/megaload/:path*',
  ],
};
