'use client';

import { useState } from 'react';
import DashboardHeader from './DashboardHeader';
import AdminSidebar from './AdminSidebar';
import UserSidebar from './UserSidebar';

export interface SettlementBadgeData {
  dday: number;
  reportStatus: 'not_eligible' | 'pending' | 'submitted' | 'completed' | 'overdue';
  eligible: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  variant: 'admin' | 'user';
  isTrainer?: boolean;
  settlementBadge?: SettlementBadgeData;
}

export default function DashboardLayout({
  children,
  userName,
  userRole,
  variant,
  isTrainer,
  settlementBadge,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {variant === 'admin' ? (
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      ) : (
        <UserSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isTrainer={isTrainer} settlementBadge={settlementBadge} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
