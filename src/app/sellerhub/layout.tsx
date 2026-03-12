import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SellerHubLayoutClient from './layout-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SellerHub | 멀티채널 자동화',
};

export default async function SellerHubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/sellerhub/dashboard');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  // SellerHub 유저 조회
  const { data: shUser } = await supabase
    .from('sellerhub_users')
    .select('id, plan, onboarding_done')
    .eq('profile_id', user.id)
    .maybeSingle();

  // 온보딩 미완료 시 리다이렉트 (온보딩 페이지 자체는 제외)
  if (!shUser || !(shUser as Record<string, unknown>).onboarding_done) {
    // children이 온보딩 페이지인 경우 리다이렉트 방지 — layout에서 URL 직접 확인 불가
    // 온보딩 페이지는 별도 layout 없이 접근 가능하도록, 여기서는 shUser 없으면 생성
    if (!shUser) {
      await supabase.from('sellerhub_users').insert({
        profile_id: user.id,
        plan: 'free',
        onboarding_done: false,
      });
    }
  }

  // 뱃지 데이터 조회
  const shUserId = (shUser as Record<string, unknown>)?.id as string | undefined;
  let pendingOrders = 0;
  let pendingInquiries = 0;
  let lowStockCount = 0;

  if (shUserId) {
    const [ordersRes, inquiriesRes, stockRes] = await Promise.all([
      supabase
        .from('sh_orders')
        .select('id', { count: 'exact', head: true })
        .eq('sellerhub_user_id', shUserId)
        .eq('order_status', 'payment_done'),
      supabase
        .from('sh_cs_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('sellerhub_user_id', shUserId)
        .eq('status', 'pending'),
      supabase
        .from('sh_inventory')
        .select('id, quantity, safety_stock, product_option_id!inner(product_id!inner(sellerhub_user_id))')
        .lte('quantity', 5),
    ]);

    pendingOrders = ordersRes.count ?? 0;
    pendingInquiries = inquiriesRes.count ?? 0;
    lowStockCount = stockRes.data?.length ?? 0;
  }

  // 연결된 채널 확인
  let hasConnectedChannels = false;
  if (shUserId) {
    const { count } = await supabase
      .from('channel_credentials')
      .select('id', { count: 'exact', head: true })
      .eq('sellerhub_user_id', shUserId)
      .eq('is_connected', true);
    hasConnectedChannels = (count ?? 0) > 0;
  }

  return (
    <SellerHubLayoutClient
      userName={profile?.full_name || user.email || '사용자'}
      userRole={profile?.role || 'pt_user'}
      badges={{
        pendingOrders,
        pendingInquiries,
        lowStockCount,
        expiringKeys: 0,
      }}
      hasConnectedChannels={hasConnectedChannels}
    >
      {children}
    </SellerHubLayoutClient>
  );
}
