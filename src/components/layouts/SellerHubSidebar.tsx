'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, MessageSquare,
  Receipt, BarChart3, Zap, Globe, Link as LinkIcon, Settings, X,
  Upload,
} from 'lucide-react';
import type { SellerHubBadgeData } from '@/lib/sellerhub/types';

const iconMap = {
  LayoutDashboard, ShoppingCart, Package, Warehouse, MessageSquare,
  Receipt, BarChart3, Zap, Globe, Link: LinkIcon, Settings, Upload,
} as const;

const navItems = [
  { href: '/sellerhub/dashboard', label: '대시보드', icon: 'LayoutDashboard' as const },
  { href: '/sellerhub/orders', label: '주문관리', icon: 'ShoppingCart' as const, badgeKey: 'pendingOrders' as const },
  { href: '/sellerhub/products', label: '상품관리', icon: 'Package' as const },
  { href: '/sellerhub/products/bulk-register', label: '상품등록', icon: 'Upload' as const },
  { href: '/sellerhub/inventory', label: '재고관리', icon: 'Warehouse' as const },
  { href: '/sellerhub/cs', label: '문의관리', icon: 'MessageSquare' as const, badgeKey: 'pendingInquiries' as const },
  { href: '/sellerhub/settlement', label: '정산', icon: 'Receipt' as const },
  { href: '/sellerhub/analytics', label: '통계', icon: 'BarChart3' as const },
  { href: '/sellerhub/automation', label: '자동화', icon: 'Zap' as const },
  { href: '/sellerhub/sourcing', label: '해외소싱', icon: 'Globe' as const },
  { href: '/sellerhub/channels', label: '채널관리', icon: 'Link' as const },
  { href: '/sellerhub/settings', label: '설정', icon: 'Settings' as const },
];

interface SellerHubSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  badges?: SellerHubBadgeData;
}

export default function SellerHubSidebar({ isOpen, onClose, badges }: SellerHubSidebarProps) {
  const pathname = usePathname();

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
            <h2 className="font-bold text-gray-900">SellerHub</h2>
            <p className="text-xs text-gray-500">멀티채널 자동화</p>
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

        <nav className="p-3 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 65px)' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = iconMap[item.icon];
            const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : 0;

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
                {badgeCount > 0 && !isActive && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
