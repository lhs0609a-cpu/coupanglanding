'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import MegaloadLayout from '@/components/layouts/MegaloadLayout';
import type { MegaloadBadgeData } from '@/lib/megaload/types';
import type { SettlementGateLevel } from '@/lib/utils/settlement';

interface MegaloadLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  gateLevel: SettlementGateLevel;
  gateDDay: number;
  gateTargetMonth: string;
  gateDeadline: string;
}

export default function MegaloadLayoutClient({
  children,
  userName,
  userRole,
  gateLevel,
  gateDDay,
  gateTargetMonth,
  gateDeadline,
}: MegaloadLayoutClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [badges, setBadges] = useState<MegaloadBadgeData | undefined>();
  const [hasConnectedChannels, setHasConnectedChannels] = useState<boolean | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // getSession()은 로컬 JWT 디코딩 (getUser()는 네트워크 요청 → 느림)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;

      const { data: shUser } = await supabase
        .from('megaload_users')
        .select('id')
        .eq('profile_id', session.user.id)
        .single();
      if (!shUser || cancelled) return;

      const shUserId = (shUser as Record<string, unknown>).id as string;

      const [ordersRes, inquiriesRes, channelsRes, bugReportMsgsRes] = await Promise.all([
        supabase
          .from('sh_orders')
          .select('id', { count: 'exact', head: true })
          .eq('megaload_user_id', shUserId)
          .eq('order_status', 'payment_done'),
        supabase
          .from('sh_cs_inquiries')
          .select('id', { count: 'exact', head: true })
          .eq('megaload_user_id', shUserId)
          .eq('status', 'pending'),
        supabase
          .from('channel_credentials')
          .select('id', { count: 'exact', head: true })
          .eq('megaload_user_id', shUserId)
          .eq('is_connected', true),
        supabase
          .from('sh_bug_report_messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_role', 'admin')
          .eq('is_read', false),
      ]);

      if (cancelled) return;

      setBadges({
        pendingOrders: ordersRes.count ?? 0,
        pendingInquiries: inquiriesRes.count ?? 0,
        lowStockCount: 0,
        expiringKeys: 0,
        unreadBugReports: bugReportMsgsRes.count ?? 0,
      });
      setHasConnectedChannels((channelsRes.count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <MegaloadLayout
      userName={userName}
      userRole={userRole}
      badges={badges}
      hasConnectedChannels={hasConnectedChannels}
      gateLevel={gateLevel}
      gateDDay={gateDDay}
      gateTargetMonth={gateTargetMonth}
      gateDeadline={gateDeadline}
    >
      {children}
    </MegaloadLayout>
  );
}
