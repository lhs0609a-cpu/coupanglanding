'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardHeader from './DashboardHeader';
import SellerHubSidebar from './SellerHubSidebar';
import { Plug, ArrowRight } from 'lucide-react';
import type { SellerHubBadgeData } from '@/lib/sellerhub/types';

interface SellerHubLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  badges?: SellerHubBadgeData;
  hasConnectedChannels?: boolean;
}

export default function SellerHubLayout({
  children,
  userName,
  userRole,
  badges,
  hasConnectedChannels,
}: SellerHubLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const showChannelBanner = hasConnectedChannels === false && !bannerDismissed;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <SellerHubSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badges={badges}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {showChannelBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
            <div className="flex items-center justify-between max-w-5xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <Plug className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    채널 연동이 필요합니다
                  </p>
                  <p className="text-xs text-amber-600">
                    쇼핑몰 API를 연동해야 상품/주문 자동화를 시작할 수 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Link
                  href="/sellerhub/channels"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition"
                >
                  채널 연동하기
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
