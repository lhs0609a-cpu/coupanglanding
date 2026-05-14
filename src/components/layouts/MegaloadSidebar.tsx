'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, MessageSquare,
  Receipt, BarChart3, Zap, Globe, Link as LinkIcon, Settings, X,
  Upload, User, ArrowRight, Search, ExternalLink, Loader2, Lock, RotateCcw, RefreshCw, Bug,
  BookOpen, Monitor,
} from 'lucide-react';
import type { MegaloadBadgeData } from '@/lib/megaload/types';
import type { SettlementGateLevel } from '@/lib/utils/settlement';

const iconMap = {
  LayoutDashboard, ShoppingCart, Package, Warehouse, MessageSquare,
  Receipt, BarChart3, Zap, Globe, Link: LinkIcon, Settings, Upload, RotateCcw, RefreshCw, Bug, BookOpen, Monitor,
} as const;

const navItems = [
  { href: '/megaload/dashboard', label: '대시보드', icon: 'LayoutDashboard' as const },
  { href: '/megaload/orders', label: '주문관리', icon: 'ShoppingCart' as const, badgeKey: 'pendingOrders' as const },
  { href: '/megaload/returns', label: '반품수거', icon: 'RotateCcw' as const },
  { href: '/megaload/products', label: '상품관리', icon: 'Package' as const },
  { href: '/megaload/products/bulk-register', label: '상품등록', icon: 'Upload' as const },
  { href: '/megaload/catalog', label: '카탈로그', icon: 'BookOpen' as const },
  { href: '/megaload/stock-monitor', label: '품절동기화', icon: 'RefreshCw' as const },
  { href: '/megaload/desktop-app', label: '데스크탑 앱', icon: 'Monitor' as const },
  { href: '/megaload/inventory', label: '재고관리', icon: 'Warehouse' as const },
  { href: '/megaload/cs', label: '문의관리', icon: 'MessageSquare' as const, badgeKey: 'pendingInquiries' as const },
  { href: '/megaload/settlement', label: '정산', icon: 'Receipt' as const },
  { href: '/megaload/analytics', label: '통계', icon: 'BarChart3' as const },
  { href: '/megaload/automation', label: '자동화', icon: 'Zap' as const },
  { href: '/megaload/sourcing', label: '해외소싱', icon: 'Globe' as const },
  { href: '/megaload/channels', label: '채널관리', icon: 'Link' as const },
  { href: '/megaload/bug-reports', label: '오류문의', icon: 'Bug' as const, badgeKey: 'unreadBugReports' as const },
  { href: '/megaload/settings', label: '설정', icon: 'Settings' as const },
];

interface SearchResult {
  id: string;
  productName: string;
  brand: string;
  coupangProductId: string;
  sourceUrl: string | null;
}

const GATE_ALLOWED_PATHS = [
  '/megaload/dashboard',
  '/megaload/settlement',
  '/megaload/cs',
  '/megaload/bug-reports',
  '/megaload/settings',
];

interface MegaloadSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  badges?: MegaloadBadgeData;
  gateLevel?: SettlementGateLevel;
}

export default function MegaloadSidebar({ isOpen, onClose, badges, gateLevel }: MegaloadSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [quickSearch, setQuickSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 검색 API 호출 (디바운스 300ms)
  const doSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/megaload/products/quick-search?q=${encodeURIComponent(query.trim())}`);
      const { results } = await res.json();
      setSearchResults(results || []);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuickSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  // 엔터 또는 버튼 클릭 → 즉시 검색
  const handleQuickSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = quickSearch.trim();
    if (!trimmed) return;
    doSearch(trimmed);
  };

  // 검색 결과 항목 클릭
  const handleResultClick = (result: SearchResult) => {
    setShowDropdown(false);
    setQuickSearch('');
    if (result.sourceUrl) {
      window.open(result.sourceUrl, '_blank');
    } else if (result.coupangProductId) {
      // 쿠팡 상품 페이지로 이동
      window.open(`https://www.coupang.com/vp/products/${result.coupangProductId}`, '_blank');
    }
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

          {/* 상품 퀵서치 (자동완성 드롭다운) */}
          <div className="px-3 pt-2" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSearch(); }}
                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                placeholder="상품명 · 브랜드 검색"
                className="w-full pl-8 pr-10 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleQuickSearch}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-[#E31837] text-white hover:bg-red-700 transition-colors"
                aria-label="검색"
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>

              {/* 검색 결과 드롭다운 */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[320px] overflow-y-auto">
                  {isSearching && searchResults.length === 0 && (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      검색 중...
                    </div>
                  )}
                  {!isSearching && searchResults.length === 0 && quickSearch.trim().length >= 2 && (
                    <div className="py-4 text-center text-sm text-gray-400">
                      검색 결과가 없습니다
                    </div>
                  )}
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleResultClick(result)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[13px] text-gray-800 font-medium leading-tight line-clamp-2">
                          {result.productName}
                        </p>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5 group-hover:text-[#E31837] transition-colors" />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {result.brand && (
                          <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {result.brand}
                          </span>
                        )}
                        {result.coupangProductId && (
                          <span className="text-[11px] text-gray-400">
                            #{result.coupangProductId}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {searchResults.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        router.push(`/megaload/products?search=${encodeURIComponent(quickSearch.trim())}`);
                        setQuickSearch('');
                        onClose();
                      }}
                      className="w-full text-center py-2 text-xs text-[#E31837] font-medium hover:bg-red-50 transition-colors"
                    >
                      상품관리에서 전체 보기 →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = iconMap[item.icon];
            const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : 0;
            const isLocked = gateLevel === 'restricted' &&
              !GATE_ALLOWED_PATHS.some((p) => item.href === p || item.href.startsWith(p + '/'));

            if (isLocked) {
              return (
                <a
                  key={item.href}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </span>
                  <Lock className="w-4 h-4 text-gray-300" />
                </a>
              );
            }

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
