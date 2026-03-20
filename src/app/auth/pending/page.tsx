'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Clock } from 'lucide-react';

export default function PendingPage() {
  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    window.location.href = '/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="font-bold text-gray-900">쿠팡 메가로드</span>
            </Link>
          </div>

          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">승인 대기 중</h2>
            <p className="text-gray-500 text-sm">
              계정이 아직 활성화되지 않았습니다.<br />
              사전등록 후 회원가입하시면 자동 승인됩니다.<br />
              문의사항은 관리자에게 연락해주세요.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full mt-8 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
