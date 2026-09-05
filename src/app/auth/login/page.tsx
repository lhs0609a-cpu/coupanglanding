'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Users, Shield, Store } from 'lucide-react';
import LoginForm from './login-form';

function LoginContent() {
  const searchParams = useSearchParams();
  const loginType = searchParams.get('loginType');

  const title = loginType === 'admin' ? '관리자 로그인'
    : loginType === 'partner' ? '파트너 로그인'
    : loginType === 'supplier' ? '공급사 로그인'
    : 'PT 사용자 로그인';

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-bold text-gray-900">쿠팡 메가로드</span>
          </Link>
          <p className="text-gray-500 mt-2">{title}</p>
        </div>
        <LoginForm />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link
          href="/auth/login?loginType=partner"
          className={`flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl border text-sm font-medium transition ${
            loginType === 'partner'
              ? 'bg-[#E31837] text-white border-[#E31837]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-[#E31837] hover:text-[#E31837]'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          파트너
        </Link>
        <Link
          href="/auth/login?loginType=supplier"
          className={`flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl border text-sm font-medium transition ${
            loginType === 'supplier'
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-500 hover:text-emerald-600'
          }`}
        >
          <Store className="w-4 h-4 shrink-0" />
          공급사
        </Link>
        <Link
          href="/auth/login?loginType=admin"
          className={`flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl border text-sm font-medium transition ${
            loginType === 'admin'
              ? 'bg-[#E31837] text-white border-[#E31837]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-[#E31837] hover:text-[#E31837]'
          }`}
        >
          <Shield className="w-4 h-4 shrink-0" />
          관리자
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="py-8 text-center text-gray-400">로딩 중...</div>}>
          <LoginContent />
        </Suspense>
      </div>
    </div>
  );
}
