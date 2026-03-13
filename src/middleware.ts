import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  try {
    // Supabase 환경변수가 없으면 모든 경로 통과 (랜딩페이지 전용 모드)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.next();
    }

    return await updateSession(request);
  } catch {
    // Supabase 모듈 로드 실패 시 통과
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/my/:path*',
    '/admin/:path*',
    '/auth/:path*',
    // /sellerhub/* 제외 — 클라이언트 컴포넌트에서 자체 인증 처리,
    // 미들웨어의 getUser() 네트워크 호출이 Vercel Edge 타임아웃 유발
  ],
};
