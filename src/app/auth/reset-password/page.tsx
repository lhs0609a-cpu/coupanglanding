'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const router = useRouter();

  // 세션 체크 — 이메일 링크로 들어온 경우 세션이 있음
  useEffect(() => {
    const check = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        setHasSession(!!session);
      } catch {
        setHasSession(false);
      }
    };
    check();
  }, []);

  // 1단계: 이메일 입력 → 재설정 링크 발송
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });

      if (resetError?.status === 429) {
        setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 2단계: 새 비밀번호 설정
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      await supabase.auth.signOut();
      setSuccess(true);
      setTimeout(() => router.push('/auth/login'), 3000);
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 로딩 중
  if (hasSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-gray-400">확인 중...</div>
      </div>
    );
  }

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
            <h1 className="text-xl font-bold text-gray-900 mt-2">
              {hasSession ? '새 비밀번호 설정' : '비밀번호 찾기'}
            </h1>
          </div>

          {/* 성공: 비밀번호 변경 완료 */}
          {success ? (
            <div className="bg-green-50 text-green-700 px-4 py-4 rounded-lg text-sm" role="status">
              <p className="font-medium mb-1">비밀번호가 변경되었습니다.</p>
              <p>잠시 후 로그인 페이지로 이동합니다...</p>
            </div>
          ) : hasSession ? (
            /* 세션 있음: 새 비밀번호 입력 폼 */
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  새 비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
                  placeholder="6자 이상 입력"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
                  placeholder="비밀번호 다시 입력"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          ) : sent ? (
            /* 이메일 발송 완료 */
            <div className="space-y-5">
              <div className="bg-green-50 text-green-700 px-4 py-4 rounded-lg text-sm" role="status">
                <p className="font-medium mb-1">이메일이 발송되었습니다.</p>
                <p>입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다. 이메일을 확인해주세요.</p>
              </div>
              <p className="text-center text-xs text-gray-400">
                이메일이 오지 않는 경우 스팸함을 확인하거나, 잠시 후 다시 시도해주세요.
              </p>
            </div>
          ) : (
            /* 세션 없음: 이메일 입력 폼 */
            <form onSubmit={handleSendEmail} className="space-y-5">
              <p className="text-gray-500 text-sm text-center">가입된 이메일로 재설정 링크를 보내드립니다.</p>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
                  placeholder="email@example.com"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '발송 중...' : '재설정 링크 보내기'}
              </button>
            </form>
          )}

          <div className="mt-6 flex justify-center gap-3 text-sm text-gray-500">
            <Link href="/auth/login" className="hover:text-[#E31837] hover:underline">
              로그인으로 돌아가기
            </Link>
            <span>|</span>
            <Link href="/auth/find-id" className="hover:text-[#E31837] hover:underline">
              아이디 찾기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
