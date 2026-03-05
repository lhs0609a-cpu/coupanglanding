'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, TrendingUp, History, FileText, BookOpen, Settings, GraduationCap, X } from 'lucide-react';

const baseNavItems = [
  { href: '/my/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/my/report', label: '매출 정산', icon: TrendingUp },
  { href: '/my/history', label: '보고 내역', icon: History },
  { href: '/my/contract', label: '계약서', icon: FileText },
  { href: '/my/guides', label: '운영 가이드', icon: BookOpen },
  { href: '/my/settings', label: '계정 설정', icon: Settings },
];

const trainerNavItem = { href: '/my/trainer', label: '트레이너', icon: GraduationCap };

interface UserSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isTrainer?: boolean;
}

export default function UserSidebar({ isOpen, onClose, isTrainer }: UserSidebarProps) {
  const pathname = usePathname();

  const navItems = isTrainer
    ? [...baseNavItems.slice(0, 5), trainerNavItem, ...baseNavItems.slice(5)]
    : baseNavItems;

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
