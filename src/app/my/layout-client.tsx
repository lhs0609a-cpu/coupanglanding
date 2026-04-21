'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import type { SettlementBadgeData, FeePaymentBadgeData, PaymentLockData } from '@/components/layouts/DashboardLayout';

interface MyLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  isTrainer?: boolean;
  settlementBadge?: SettlementBadgeData;
  feePaymentBadge?: FeePaymentBadgeData;
  coupangApiConnected?: boolean;
  hasPaymentCards?: boolean;
  paymentLock?: PaymentLockData;
}

export default function MyLayoutClient({ children, userName, userRole, isTrainer, settlementBadge, feePaymentBadge, coupangApiConnected, hasPaymentCards, paymentLock }: MyLayoutClientProps) {
  return (
    <DashboardLayout
      userName={userName}
      userRole={userRole}
      variant="user"
      isTrainer={isTrainer}
      settlementBadge={settlementBadge}
      feePaymentBadge={feePaymentBadge}
      coupangApiConnected={coupangApiConnected}
      hasPaymentCards={hasPaymentCards}
      paymentLock={paymentLock}
    >
      {children}
    </DashboardLayout>
  );
}
