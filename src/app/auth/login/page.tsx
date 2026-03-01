'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="font-bold text-gray-900">쿠팡 셀러허브</span>
            </Link>
            <p className="text-gray-500 mt-2">관리 시스템</p>
          </div>
          <Suspense fallback={<div className="py-8 text-center text-gray-400">로딩 중...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
