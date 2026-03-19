'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function FindIdPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMaskedEmail('');
    setLoading(true);

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || !/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      setError('올바른 휴대폰 번호를 입력해주세요.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: cleanPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '계정을 찾을 수 없습니다.');
        setLoading(false);
        return;
      }

      setMaskedEmail(data.maskedEmail);
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
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
            <h1 className="text-xl font-bold text-gray-900 mt-2">아이디 찾기</h1>
            <p className="text-gray-500 text-sm mt-1">가입 시 등록한 이름과 연락처를 입력해주세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                이름
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
                placeholder="홍길동"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                연락처
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
                placeholder="010-1234-5678"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
                {error}
              </div>
            )}

            {maskedEmail && (
              <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm" role="status">
                <p className="font-medium mb-1">가입된 이메일을 찾았습니다.</p>
                <p className="text-lg font-bold">{maskedEmail}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '조회 중...' : '아이디 찾기'}
            </button>
          </form>

          <div className="mt-6 flex justify-center gap-3 text-sm text-gray-500">
            <Link href="/auth/login" className="hover:text-[#E31837] hover:underline">
              로그인으로 돌아가기
            </Link>
            <span>|</span>
            <Link href="/auth/reset-password" className="hover:text-[#E31837] hover:underline">
              비밀번호 찾기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
