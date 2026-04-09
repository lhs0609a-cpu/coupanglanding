'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  PieChart,
  Users,
  Settings,
  FileText,
  ClipboardList,
  UserCheck,
  UserPlus,
  BookOpen,
  ScrollText,
  GraduationCap,
  Flame,
  ShieldAlert,
  Gavel,
  Receipt,
  Swords,
  X,
  Bell,
  MessageCircle,
  HelpCircle,
  Bug,
  Table2,
} from 'lucide-react';

const navItems = [
  { href: '/admin/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/admin/sales-overview', label: '매출 현황', icon: Table2 },
  { href: '/admin/applications', label: '신청 관리', icon: ClipboardList },
  { href: '/admin/screening', label: '파트너 스크리닝', icon: UserCheck },
  { href: '/admin/pre-registrations', label: '사전등록 관리', icon: UserPlus },
  { href: '/admin/revenue', label: '수익 관리', icon: TrendingUp },
  { href: '/admin/expenses', label: '비용 관리', icon: CreditCard },
  { href: '/admin/distribution', label: '수익 분배', icon: PieChart },
  { href: '/admin/contracts', label: '계약 관리', icon: FileText },
  { href: '/admin/pt-users', label: 'PT 사용자 관리', icon: Users },
  { href: '/admin/trainers', label: '트레이너 관리', icon: GraduationCap },
  { href: '/admin/trends', label: '트렌드 관리', icon: Flame },
  { href: '/admin/emergency', label: '긴급 대응 관리', icon: ShieldAlert },
  { href: '/admin/violations', label: '계약위반 관리', icon: Gavel },
  { href: '/admin/tax-invoices', label: '세금계산서', icon: Receipt },
  { href: '/admin/arena', label: '아레나 관리', icon: Swords },
  { href: '/admin/guide-images', label: '가이드 이미지', icon: BookOpen },
  { href: '/admin/notices', label: '공지 관리', icon: Bell },
  { href: '/admin/support', label: '문의 관리', icon: MessageCircle },
  { href: '/admin/megaload-bug-reports', label: '메가로드 오류문의', icon: Bug },
  { href: '/admin/faqs', label: 'FAQ 관리', icon: HelpCircle },
  { href: '/admin/activity-log', label: '활동 로그', icon: ScrollText },
  { href: '/admin/settings', label: '설정', icon: Settings },
];

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
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
            <h2 className="font-bold text-gray-900">관리자</h2>
            <p className="text-xs text-gray-500">메가로드 관리 시스템</p>
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
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#E31837] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
