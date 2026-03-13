import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SellerHubLayoutClient from './layout-client';

export const metadata = {
  title: 'SellerHub | 멀티채널 자동화',
};

export default async function SellerHubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession()은 JWT 로컬 디코딩 (네트워크 요청 없음)
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect('/auth/login?redirect=/sellerhub/dashboard');
  }

  const user = session.user;

  // profile + shUser 병렬 조회
  const [{ data: profile }, { data: shUser }] = await Promise.all([
    supabase.from('profiles').select('full_name, role').eq('id', user.id).single(),
    supabase.from('sellerhub_users').select('id, plan, onboarding_done').eq('profile_id', user.id).maybeSingle(),
  ]);

  if (!shUser) {
    await supabase.from('sellerhub_users').insert({
      profile_id: user.id,
      plan: 'free',
      onboarding_done: false,
    });
  }

  // 뱃지/채널 데이터는 클라이언트에서 비동기 로드 → 페이지 렌더링 차단 안 함
  return (
    <SellerHubLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
    >
      {children}
    </SellerHubLayoutClient>
  );
}
