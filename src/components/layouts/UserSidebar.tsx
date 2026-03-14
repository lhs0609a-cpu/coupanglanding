'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, TrendingUp, History, FileText, BookOpen, Settings, GraduationCap, X, School, Flame, ShieldAlert, Gavel, Receipt, MessageSquare, Map, ShieldCheck, Trophy, Search, Megaphone, Lightbulb, Building2, Bell, MessageCircle, HelpCircle, Tv } from 'lucide-react';
import type { SettlementBadgeData, FeePaymentBadgeData } from './DashboardLayout';
import FeePaymentBanner from '@/components/settlement/FeePaymentBanner';
import type { FeePaymentStatus } from '@/lib/supabase/types';

const baseNavItems = [
  { href: '/my/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/my/report', label: '매출 정산', icon: TrendingUp },
  { href: '/my/history', label: '보고 내역', icon: History },
  { href: '/my/trends', label: '트렌드', icon: Flame },
  { href: '/my/contract', label: '계약서', icon: FileText },
  { href: '/my/emergency', label: '긴급 대응', icon: ShieldAlert },
  { href: '/my/violations', label: '계약위반', icon: Gavel },
  { href: '/my/tax-invoices', label: '세금계산서', icon: Receipt },
  { href: '/my/cs-templates', label: 'CS 템플릿', icon: MessageSquare },
  { href: '/my/growth', label: '성장 로드맵', icon: Map },
  { href: '/my/scaling-guide', label: '사업 확장', icon: Building2 },
  { href: '/my/penalty', label: '페널티 트래커', icon: ShieldCheck },
  { href: '/my/arena', label: '상품등록 랭킹', icon: Trophy },
  { href: '/my/product-search', label: '상품검색', icon: Search },
  { href: '/my/ad-tips', label: '광고 노하우', icon: Lightbulb },
  { href: '/my/promotion', label: '프로모션', icon: Megaphone },
  { href: '/my/education', label: '교육', icon: School },
  { href: '/my/ad-academy', label: '광고 아카데미', icon: Tv },
  { href: '/my/guides', label: '운영 가이드', icon: BookOpen },
  { href: '/my/notices', label: '공지사항', icon: Bell },
  { href: '/my/support', label: '1:1 문의', icon: MessageCircle },
  { href: '/my/faq', label: 'FAQ', icon: HelpCircle },
  { href: '/my/settings', label: '계정 설정', icon: Settings },
];

const trainerNavItem = { href: '/my/trainer', label: '트레이너', icon: GraduationCap };

interface UserSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isTrainer?: boolean;
  settlementBadge?: SettlementBadgeData;
  feePaymentBadge?: FeePaymentBadgeData;
}

export default function UserSidebar({ isOpen, onClose, isTrainer, settlementBadge, feePaymentBadge }: UserSidebarProps) {
  const pathname = usePathname();

  const navItems = isTrainer
    ? [...baseNavItems.slice(0, 7), trainerNavItem, ...baseNavItems.slice(7)]
    : baseNavItems;

  // D-Day ≤ 7이고 미제출 시 빨간 뱃지 표시
  const showBadge = settlementBadge
    && settlementBadge.eligible
    && settlementBadge.dday <= 7
    && (settlementBadge.reportStatus === 'pending' || settlementBadge.reportStatus === 'overdue');

  const badgeText = settlementBadge
    ? (settlementBadge.dday <= 0 ? `+${Math.abs(settlementBadge.dday)}` : String(settlementBadge.dday))
    : '';

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900">내 PT</h2>
            <p className="text-xs text-gray-500">매출 정산 & 관리</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 lg:hidden"
            aria-label="메뉴 닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            const isReportItem = item.href === '/my/report';
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#E31837] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  {item.label}
                </span>
                {isReportItem && showBadge && !isActive && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {badgeText}
                  </span>
                )}
                {isReportItem && !isActive && feePaymentBadge && (
                  <FeePaymentBanner
                    variant="inline"
                    feePaymentStatus={feePaymentBadge.status as FeePaymentStatus}
                    feePaymentDeadline={feePaymentBadge.deadline}
                    unpaidAmount={feePaymentBadge.unpaidAmount}
                    yearMonth={feePaymentBadge.yearMonth}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
