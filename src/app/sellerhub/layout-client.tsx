'use client';

import SellerHubLayout from '@/components/layouts/SellerHubLayout';
import type { SellerHubBadgeData } from '@/lib/sellerhub/types';

interface SellerHubLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  badges?: SellerHubBadgeData;
  hasConnectedChannels?: boolean;
}

export default function SellerHubLayoutClient({
  children,
  userName,
  userRole,
  badges,
  hasConnectedChannels,
}: SellerHubLayoutClientProps) {
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
