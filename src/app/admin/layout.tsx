import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminLayoutClient from './layout-client';

export const metadata = {
  title: '관리자 | 쿠팡 셀러허브',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/admin/dashboard');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'partner')) {
    redirect('/auth/login');
  }

  return (
    <AdminLayoutClient
      userName={profile.full_name || user.email || '관리자'}
      userRole={profile.role}
    >
      {children}
    </AdminLayoutClient>
  );
}
