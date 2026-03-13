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
    '/sellerhub/:path*',
  ],
};
