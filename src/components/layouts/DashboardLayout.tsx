'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardHeader from './DashboardHeader';
import AdminSidebar from './AdminSidebar';
import UserSidebar from './UserSidebar';
import { Plug, ArrowRight, CreditCard, AlertTriangle, Shield } from 'lucide-react';

export interface SettlementBadgeData {
  dday: number;
  reportStatus: 'not_eligible' | 'pending' | 'submitted' | 'completed' | 'overdue';
  eligible: boolean;
}

export interface FeePaymentBadgeData {
  status: string;          // FeePaymentStatus
  deadline: string | null;
  unpaidAmount: number;
  yearMonth: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  variant: 'admin' | 'user';
  isTrainer?: boolean;
  settlementBadge?: SettlementBadgeData;
  feePaymentBadge?: FeePaymentBadgeData;
  coupangApiConnected?: boolean;
  hasPaymentCards?: boolean;
}

export default function DashboardLayout({
  children,
  userName,
  userRole,
  variant,
  isTrainer,
  settlementBadge,
  feePaymentBadge,
  coupangApiConnected,
  hasPaymentCards,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const showApiBanner = variant === 'user' && coupangApiConnected === false && !bannerDismissed;

  // 미납 수수료 있고 + 카드 미등록 → 강제 오버레이
  const showForcedOverlay =
    variant === 'user' &&
    hasPaymentCards === false &&
    !!feePaymentBadge &&
    ['awaiting_payment', 'overdue'].includes(feePaymentBadge.status);

  const isOverdue = feePaymentBadge?.status === 'overdue';
  const deadlineText = feePaymentBadge?.deadline
    ? new Date(feePaymentBadge.deadline).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {variant === 'admin' ? (
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      ) : (
        <UserSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isTrainer={isTrainer} settlementBadge={settlementBadge} feePaymentBadge={feePaymentBadge} />
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

      {/* 미납 + 카드 미등록 강제 오버레이 — 모든 /my/* 페이지에 표시 */}
      {showForcedOverlay && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* 상단 경고 헤더 */}
            <div className={`rounded-t-2xl px-6 py-5 text-center ${isOverdue ? 'bg-red-600' : 'bg-amber-500'}`}>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                <AlertTriangle className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {isOverdue ? '수수료가 연체되었습니다' : '수수료 납부가 필요합니다'}
              </h2>
              <p className="mt-1 text-sm text-white/90">
                결제 카드를 등록하고 바로 납부해주세요
              </p>
            </div>

            {/* 본문 */}
            <div className="px-6 py-5 space-y-4">
              {/* 금액 */}
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">
                  {feePaymentBadge?.yearMonth?.replace('-', '년 ')}월 수수료
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {(feePaymentBadge?.unpaidAmount ?? 0).toLocaleString()}원
                </p>
                {deadlineText && (
                  <p className={`mt-1 text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                    {isOverdue ? `납부기한 ${deadlineText} 경과` : `납부기한: ${deadlineText}`}
                  </p>
                )}
              </div>

              {/* 안내 */}
              {isOverdue && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">
                    연체 시 부과금이 추가됩니다. 카드를 등록하면 즉시 자동결제 됩니다.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-gray-500">
                <Shield className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <p>토스페이먼츠 보안 결제 — 카드 정보는 안전하게 관리됩니다</p>
              </div>

              {/* 카드 등록 버튼 */}
              <Link
                href="/my/settings"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E31837] px-5 py-3.5 text-base font-bold text-white hover:bg-[#c81530] transition"
              >
                <CreditCard className="h-5 w-5" />
                결제 카드 등록하기
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
