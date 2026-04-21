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

export interface PaymentLockData {
  lockLevel: 0 | 1 | 2 | 3;
  overdueSince: string | null;  // yyyy-MM-dd
  hasCard: boolean;
  exemptUntil: string | null;
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
  paymentLock?: PaymentLockData;
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
  paymentLock,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [lockModalDismissed, setLockModalDismissed] = useState(false);

  const showApiBanner = variant === 'user' && coupangApiConnected === false && !bannerDismissed;

  // Lock 상태 계산 — exempt 고려
  const todayStr = new Date().toISOString().slice(0, 10);
  const exemptActive = !!(paymentLock?.exemptUntil && paymentLock.exemptUntil > todayStr);
  const effectiveLockLevel = (exemptActive ? 0 : (paymentLock?.lockLevel ?? 0)) as 0 | 1 | 2 | 3;

  // 경과일 / 다음 단계까지 남은 일수 계산
  const daysSinceOverdue = paymentLock?.overdueSince
    ? Math.floor((Date.now() - new Date(paymentLock.overdueSince).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const nextThresholdDays = effectiveLockLevel === 0
    ? 1
    : effectiveLockLevel === 1
      ? 3
      : effectiveLockLevel === 2
        ? 7
        : null;
  const daysUntilNextLevel = nextThresholdDays !== null
    ? Math.max(0, nextThresholdDays - daysSinceOverdue)
    : null;

  // Hard block: 닫기 불가 — payment_lock_level === 3 완전 봉쇄에만 한정.
  //   "카드 미등록 + 미납" 만으로는 hard block 하지 않음 — soft warning 으로 낮춰
  //   사이드바·메가로드 링크 같은 정상 네비게이션이 막히지 않도록 한다.
  // Soft warning: L1/L2 OR 카드 미등록 + 미납 — 닫기 가능, 페이지 이동 시 재등장.
  const hasUnpaidFee = !!feePaymentBadge && ['awaiting_payment', 'overdue'].includes(feePaymentBadge.status);
  const noCardWithUnpaid = hasPaymentCards === false && hasUnpaidFee;
  const isHardBlock = effectiveLockLevel === 3;
  const isSoftWarning =
    effectiveLockLevel === 1 || effectiveLockLevel === 2 || noCardWithUnpaid;
  const showForcedOverlay = variant === 'user' && (
    isHardBlock || (isSoftWarning && !lockModalDismissed)
  );

  const isOverdue = feePaymentBadge?.status === 'overdue' || effectiveLockLevel >= 1;
  const deadlineText = feePaymentBadge?.deadline
    ? new Date(feePaymentBadge.deadline).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Lock 레벨별 UI 메타
  const lockMeta: Record<0 | 1 | 2 | 3, { title: string; subtitle: string; bannerBg: string; restrictions: string[] }> = {
    0: { title: '수수료 납부가 필요합니다', subtitle: '결제 카드를 등록하고 바로 납부해주세요', bannerBg: 'bg-amber-500', restrictions: [] },
    1: {
      title: '⚠️ L1 부분 차단 중',
      subtitle: `미납 ${daysSinceOverdue}일 경과 · ${daysUntilNextLevel ?? 0}일 뒤 L2 전체 차단`,
      bannerBg: 'bg-amber-600',
      restrictions: ['신규 상품 등록 차단', '일괄 처리/사입 동기화 차단', '조회와 일반 쓰기만 허용'],
    },
    2: {
      title: '🔒 L2 전체 차단 중',
      subtitle: `미납 ${daysSinceOverdue}일 경과 · ${daysUntilNextLevel ?? 0}일 뒤 L3 완전 봉쇄`,
      bannerBg: 'bg-orange-600',
      restrictions: ['모든 POST/PUT/DELETE 차단', '상품·주문·가격 수정 불가', '조회만 가능'],
    },
    3: {
      title: '🚫 L3 완전 봉쇄',
      subtitle: `미납 ${daysSinceOverdue}일 경과 · 결제 페이지만 접근 가능`,
      bannerBg: 'bg-red-700',
      restrictions: ['모든 기능 차단', '결제 설정 페이지만 접근', '카드 등록 + 즉시 결제 시 복구'],
    },
  };
  const meta = lockMeta[effectiveLockLevel];

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

      {/* 결제/Lock 강제 오버레이 — 닫을 수 없음. Lock 레벨에 따라 동적 */}
      {showForcedOverlay && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* 상단 경고 헤더 — Lock 레벨별 색상 */}
            <div className={`rounded-t-2xl px-6 py-5 text-center ${meta.bannerBg}`}>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                <AlertTriangle className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {effectiveLockLevel === 0
                  ? (isOverdue ? '수수료가 연체되었습니다' : meta.title)
                  : meta.title}
              </h2>
              <p className="mt-1 text-sm text-white/90">{meta.subtitle}</p>
            </div>

            {/* 본문 */}
            <div className="px-6 py-5 space-y-4">
              {/* 카운트다운 + 경과 단계 */}
              {effectiveLockLevel > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-red-700">현재 상태</span>
                    <span className="text-xs font-bold text-red-800">
                      L{effectiveLockLevel} · D+{daysSinceOverdue}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-red-700">
                    {meta.restrictions.map((r, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="mt-0.5">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                  {daysUntilNextLevel !== null && daysUntilNextLevel > 0 && (
                    <p className="mt-2 text-[11px] font-medium text-red-600 border-t border-red-200 pt-2">
                      ⏰ <strong>{daysUntilNextLevel}일 뒤</strong> 다음 단계로 자동 상승합니다
                    </p>
                  )}
                </div>
              )}

              {/* 금액 */}
              {feePaymentBadge && (
                <div className="rounded-xl bg-gray-50 p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">
                    {feePaymentBadge.yearMonth?.replace('-', '년 ')}월 수수료
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(feePaymentBadge.unpaidAmount ?? 0).toLocaleString()}원
                  </p>
                  {deadlineText && (
                    <p className={`mt-1 text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                      {isOverdue ? `납부기한 ${deadlineText} 경과` : `납부기한: ${deadlineText}`}
                    </p>
                  )}
                </div>
              )}

              {/* 카드 유무 안내 */}
              {!hasPaymentCards && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <CreditCard className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    <strong>결제 카드가 등록되지 않아 자동결제가 불가능합니다.</strong>{' '}
                    카드를 등록하면 미납 금액이 즉시 결제되고 모든 제한이 해제됩니다.
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
                {hasPaymentCards ? '지금 결제하기' : '결제 카드 등록하기'}
              </Link>

              {/* Soft warning: 닫기 허용 (페이지 이동 시 재등장) */}
              {!isHardBlock && isSoftWarning && (
                <button
                  onClick={() => setLockModalDismissed(true)}
                  className="w-full py-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  나중에 보기 (이 페이지에서만 숨기기)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
