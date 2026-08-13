import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '네이버 소싱 | 쿠팡 메가로드',
};

/**
 * 네이버 소싱은 관리자 전용이다 — 서버에서 막는다.
 * 사이드바에서 메뉴를 숨기는 건 표시용이라, 주소를 직접 치면 들어와진다. 여기가 실제 경계다.
 * (수집 실행 자체는 도우미가 로그인 계정 role 로 한 번 더 검증한다)
 */
export default async function NaverSourcingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/megaload/naver-sourcing');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/megaload/dashboard');

  return <>{children}</>;
}
