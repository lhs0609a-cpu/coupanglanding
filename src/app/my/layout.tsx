import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MyLayoutClient from './layout-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '내 PT | 쿠팡 셀러허브',
};

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/my/dashboard');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  // 트레이너 여부 확인
  let isTrainer = false;
  const { data: ptUser } = await supabase
    .from('pt_users')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (ptUser) {
    const { data: trainer } = await supabase
      .from('trainers')
      .select('id')
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'approved')
      .maybeSingle();

    isTrainer = !!trainer;
  }

  return (
    <MyLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
      isTrainer={isTrainer}
    >
      {children}
    </MyLayoutClient>
  );
}
