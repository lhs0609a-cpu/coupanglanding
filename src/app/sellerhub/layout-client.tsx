'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import SellerHubLayout from '@/components/layouts/SellerHubLayout';
import type { SellerHubBadgeData } from '@/lib/sellerhub/types';

interface SellerHubLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
}

export default function SellerHubLayoutClient({
  children,
  userName,
  userRole,
}: SellerHubLayoutClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [badges, setBadges] = useState<SellerHubBadgeData | undefined>();
  const [hasConnectedChannels, setHasConnectedChannels] = useState<boolean | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: shUser } = await supabase
        .from('sellerhub_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();
      if (!shUser || cancelled) return;

      const shUserId = (shUser as Record<string, unknown>).id as string;

      const [ordersRes, inquiriesRes, channelsRes] = await Promise.all([
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
          .from('channel_credentials')
          .select('id', { count: 'exact', head: true })
          .eq('sellerhub_user_id', shUserId)
          .eq('is_connected', true),
      ]);

      if (cancelled) return;

      setBadges({
        pendingOrders: ordersRes.count ?? 0,
        pendingInquiries: inquiriesRes.count ?? 0,
        lowStockCount: 0,
        expiringKeys: 0,
      });
      setHasConnectedChannels((channelsRes.count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <SellerHubLayout
      userName={userName}
      userRole={userRole}
      badges={badges}
      hasConnectedChannels={hasConnectedChannels}
    >
      {children}
    </SellerHubLayout>
  );
}
