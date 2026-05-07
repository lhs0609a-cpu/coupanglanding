'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Menu, Shield, User } from 'lucide-react';
import NotificationBell from '@/components/ui/NotificationBell';

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
  onMenuClick?: () => void;
}

export default function DashboardHeader({ userName, userRole, onMenuClick }: DashboardHeaderProps) {
  const pathname = usePathname();
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  const roleLabel = userRole === 'admin' ? '관리자' : userRole === 'partner' ? '파트너' : 'PT 사용자';
  const isAdmin = userRole === 'admin';
  const inAdminMode = pathname?.startsWith('/admin') ?? false;
  const inUserMode = pathname?.startsWith('/my') ?? false;
  // 어드민이 PT 모드 보고 있으면 "관리자 모드 전환" / 어드민 모드면 "PT 모드 전환" 노출
  const showAdminLink = isAdmin && inUserMode;
  const showUserLink = isAdmin && inAdminMode;

  return (
    <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
            aria-label="메뉴"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <span className="text-sm text-gray-500 hidden sm:block">쿠팡 메가로드 관리</span>
      </div>

      <div className="flex items-center gap-3">
        {showAdminLink && (
          <Link
            href="/admin/dashboard"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition"
            title="관리자 모드로 전환"
          >
            <Shield className="w-3.5 h-3.5" />
            관리자 모드
          </Link>
        )}
        {showUserLink && (
          <Link
            href="/my/dashboard"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition"
            title="PT 사용자 모드로 전환"
          >
            <User className="w-3.5 h-3.5" />
            PT 모드
          </Link>
        )}
        <NotificationBell />
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{userName}</p>
          <p className="text-xs text-gray-500">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-gray-700"
          aria-label="로그아웃"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
