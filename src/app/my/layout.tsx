import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MyLayoutClient from './layout-client';

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

  return (
    <MyLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
    >
      {children}
    </MyLayoutClient>
  );
}
