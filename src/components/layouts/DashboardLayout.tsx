'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardHeader from './DashboardHeader';
import AdminSidebar from './AdminSidebar';
import UserSidebar from './UserSidebar';
import { Plug, ArrowRight } from 'lucide-react';

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
  coupangApiConnected?: boolean;
}

export default function DashboardLayout({
  children,
  userName,
  userRole,
  variant,
  isTrainer,
  settlementBadge,
  coupangApiConnected,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const showApiBanner = variant === 'user' && coupangApiConnected === false && !bannerDismissed;

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

        {/* 쿠팡 API 미연동 배너 */}
        {showApiBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
            <div className="flex items-center justify-between max-w-5xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <Plug className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    쿠팡 Open API 연동이 필요합니다
                  </p>
                  <p className="text-xs text-amber-600">
                    API를 연동해야 계약서 서명 및 서비스 이용이 가능합니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Link
                  href="/my/settings"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition"
                >
                  API 연동하기
                  <ArrowRight className="w-3 h-3" />
                </Link>
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-amber-400 hover:text-amber-600 text-lg leading-none px-1"
                  title="닫기"
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
