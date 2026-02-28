'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Menu } from 'lucide-react';

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
  onMenuClick?: () => void;
}

export default function DashboardHeader({ userName, userRole, onMenuClick }: DashboardHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const roleLabel = userRole === 'admin' ? '관리자' : userRole === 'partner' ? '파트너' : 'PT 사용자';

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
        <span className="text-sm text-gray-500 hidden sm:block">쿠팡 셀러허브 관리</span>
      </div>

      <div className="flex items-center gap-4">
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
