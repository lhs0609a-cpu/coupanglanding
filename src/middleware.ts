import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/my/:path*',
    '/admin/:path*',
    '/auth/:path*',
    '/megaload/:path*',
    // /api/* 전체 — 락 allowlist 는 updateSession 내부에서 적용.
    // _next/static, _next/image, favicon.ico 등 정적 자원은 매칭에서 제외.
    '/api/:path*',
  ],
};
