'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, MessageSquare,
  Receipt, BarChart3, Zap, Globe, Link as LinkIcon, Settings, X,
  Upload, User, ArrowRight, Search,
} from 'lucide-react';
import type { MegaloadBadgeData } from '@/lib/megaload/types';

const iconMap = {
  LayoutDashboard, ShoppingCart, Package, Warehouse, MessageSquare,
  Receipt, BarChart3, Zap, Globe, Link: LinkIcon, Settings, Upload,
} as const;

const navItems = [
  { href: '/megaload/dashboard', label: '대시보드', icon: 'LayoutDashboard' as const },
  { href: '/megaload/orders', label: '주문관리', icon: 'ShoppingCart' as const, badgeKey: 'pendingOrders' as const },
  { href: '/megaload/products', label: '상품관리', icon: 'Package' as const },
  { href: '/megaload/products/bulk-register', label: '상품등록', icon: 'Upload' as const },
  { href: '/megaload/inventory', label: '재고관리', icon: 'Warehouse' as const },
  { href: '/megaload/cs', label: '문의관리', icon: 'MessageSquare' as const, badgeKey: 'pendingInquiries' as const },
  { href: '/megaload/settlement', label: '정산', icon: 'Receipt' as const },
  { href: '/megaload/analytics', label: '통계', icon: 'BarChart3' as const },
  { href: '/megaload/automation', label: '자동화', icon: 'Zap' as const },
  { href: '/megaload/sourcing', label: '해외소싱', icon: 'Globe' as const },
  { href: '/megaload/channels', label: '채널관리', icon: 'Link' as const },
  { href: '/megaload/settings', label: '설정', icon: 'Settings' as const },
];

interface MegaloadSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  badges?: MegaloadBadgeData;
}

export default function MegaloadSidebar({ isOpen, onClose, badges }: MegaloadSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [quickSearch, setQuickSearch] = useState('');

  const handleQuickSearch = async () => {
    const trimmed = quickSearch.trim();
    if (!trimmed) return;
    setQuickSearch('');

    // DB에서 판매자상품명으로 검색 → 저장된 sourceUrl(product_summary.txt 원본 링크)로 이동
    try {
      const res = await fetch(`/api/megaload/products/quick-search?q=${encodeURIComponent(trimmed)}`);
      const { sourceUrl } = await res.json();
      if (sourceUrl) {
        window.open(sourceUrl, '_blank');
        onClose();
        return;
      }
    } catch { /* API 실패 시 폴백 */ }

    // DB에 없으면 상품목록 페이지에서 검색
    router.push(`/megaload/products?search=${encodeURIComponent(trimmed)}`);
    onClose();
  };

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
            <h2 className="font-bold text-gray-900">Megaload</h2>
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

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 65px)' }}>
          {/* 내 PT 바로가기 카드 */}
          <div className="px-3 pt-3">
            <Link
              href="/my/dashboard"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-[#E31837] to-rose-600 text-white hover:from-red-700 hover:to-rose-700 transition-all group"
            >
              <User className="w-5 h-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">내 PT</p>
                <p className="text-[11px] text-white/80">매출 정산 & 관리</p>
              </div>
              <ArrowRight className="w-4 h-4 shrink-0 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>

          {/* 상품번호 퀵서치 */}
          <div className="px-3 pt-2">
            <div className="relative flex">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSearch(); }}
                placeholder="상품번호 검색"
                className="w-full pl-8 pr-10 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleQuickSearch}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-[#E31837] text-white hover:bg-red-700 transition-colors"
                aria-label="검색"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        <nav className="p-3 space-y-1">
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
        </div>
      </aside>
    </>
  );
}
