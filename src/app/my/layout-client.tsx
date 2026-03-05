'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import type { SettlementBadgeData } from '@/components/layouts/DashboardLayout';

interface MyLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  isTrainer?: boolean;
  settlementBadge?: SettlementBadgeData;
}

export default function MyLayoutClient({ children, userName, userRole, isTrainer, settlementBadge }: MyLayoutClientProps) {
  return (
    <DashboardLayout userName={userName} userRole={userRole} variant="user" isTrainer={isTrainer} settlementBadge={settlementBadge}>
      {children}
    </DashboardLayout>
  );
}
