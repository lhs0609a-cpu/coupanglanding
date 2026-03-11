'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import type { SettlementBadgeData, FeePaymentBadgeData } from '@/components/layouts/DashboardLayout';

interface MyLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  isTrainer?: boolean;
  settlementBadge?: SettlementBadgeData;
  feePaymentBadge?: FeePaymentBadgeData;
  coupangApiConnected?: boolean;
}

export default function MyLayoutClient({ children, userName, userRole, isTrainer, settlementBadge, feePaymentBadge, coupangApiConnected }: MyLayoutClientProps) {
  return (
    <DashboardLayout
      userName={userName}
      userRole={userRole}
      variant="user"
      isTrainer={isTrainer}
      settlementBadge={settlementBadge}
      feePaymentBadge={feePaymentBadge}
      coupangApiConnected={coupangApiConnected}
    >
      {children}
    </DashboardLayout>
  );
}
