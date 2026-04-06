'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import DashboardHeader from './DashboardHeader';
import MegaloadSidebar from './MegaloadSidebar';
import { Plug, ArrowRight } from 'lucide-react';
import type { MegaloadBadgeData } from '@/lib/megaload/types';
import type { SettlementGateLevel } from '@/lib/utils/settlement';
import SettlementWarningModal from '@/components/megaload/SettlementWarningModal';
import SettlementGatePage, { SettlementBlockPage } from '@/components/megaload/SettlementGatePage';

const ALLOWED_PATHS = [
  '/megaload/dashboard',
  '/megaload/settlement',
  '/megaload/cs',
  '/megaload/settings',
];

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

interface MegaloadLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  badges?: MegaloadBadgeData;
  hasConnectedChannels?: boolean;
  gateLevel: SettlementGateLevel;
  gateDDay: number;
  gateTargetMonth: string;
  gateDeadline: string;
}

export default function MegaloadLayout({
  children,
  userName,
  userRole,
  badges,
  hasConnectedChannels,
  gateLevel,
  gateDDay,
  gateTargetMonth,
  gateDeadline,
}: MegaloadLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const prevPathRef = useRef(pathname);

  // pathname 변경 시 warning 모달 다시 표시
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setWarningDismissed(false);
    }
  }, [pathname]);

  const showChannelBanner = hasConnectedChannels === false && !bannerDismissed;

  // Tier 3: 풀스크린 차단
  if (gateLevel === 'blocked') {
    return (
      <SettlementBlockPage
        dday={gateDDay}
        targetMonth={gateTargetMonth}
        deadline={gateDeadline}
      />
    );
  }

  // Tier 2: 허용 경로 외 접근 시 인라인 게이트
  const showInlineGate = gateLevel === 'restricted' && !isAllowedPath(pathname);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Tier 1: Warning Modal */}
      {gateLevel === 'warning' && !warningDismissed && (
        <SettlementWarningModal
          dday={gateDDay}
          targetMonth={gateTargetMonth}
          deadline={gateDeadline}
          onClose={() => setWarningDismissed(true)}
        />
      )}

      <MegaloadSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badges={badges}
        gateLevel={gateLevel}
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
                  href="/megaload/channels"
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
          {showInlineGate ? (
            <SettlementGatePage
              dday={gateDDay}
              targetMonth={gateTargetMonth}
              deadline={gateDeadline}
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
