'use client';

import { useState } from 'react';
import DashboardHeader from './DashboardHeader';
import AdminSidebar from './AdminSidebar';
import UserSidebar from './UserSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  variant: 'admin' | 'user';
}

export default function DashboardLayout({
  children,
  userName,
  userRole,
  variant,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {variant === 'admin' ? (
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      ) : (
        <UserSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
