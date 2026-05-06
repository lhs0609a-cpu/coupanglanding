'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const type = searchParams.get('type');
  const [isSignup, setIsSignup] = useState(type === 'signup');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let supabase;
      try {
        supabase = createClient();
      } catch (err) {
        if (err instanceof Error && err.message === 'SUPABASE_NOT_CONFIGURED') {
          setError('서버 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.');
        } else {
          setError('연결 오류가 발생했습니다.');
        }
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message === 'Invalid login credentials') {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (authError.status === 429) {
          setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        } else if (!authError.message || authError.message === '0' || authError.message === 'Failed to fetch') {
          setError('서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
        } else if (authError.message === 'Email not confirmed') {
          setError('이메일 인증이 완료되지 않았습니다. 이메일을 확인해주세요.');
        } else {
          setError(`로그인 오류: ${authError.message}`);
        }
        return;
      }

      if (!data?.user) {
        setError('로그인 응답이 올바르지 않습니다. 다시 시도해주세요.');
        return;
      }

      // 역할 및 승인 상태 체크
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('프로필 조회 오류:', profileError);
        setError(`프로필 조회 실패: ${profileError.message}`);
        return;
      }

      // 미승인 유저 차단 (admin/partner는 제외)
      if (profile && profile.role !== 'admin' && profile.role !== 'partner' && !profile.is_active) {
        await supabase.auth.signOut();
        setError('관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.');
        return;
      }

      if (redirect) {
        router.push(redirect);
      } else if (profile?.role === 'admin' || profile?.role === 'partner') {
        router.push('/admin/dashboard');
      } else {
        router.push('/my/dashboard');
      }

      router.refresh();
    } catch (err) {
      console.error('로그인 처리 중 오류:', err);
      setError(err instanceof Error ? `오류: ${err.message}` : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      setLoading(false);
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone && !/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      setError('올바른 휴대폰 번호를 입력해주세요.');
      setLoading(false);
      return;
    }

    // 35s 타임아웃 가드 — 서버 hang 시 사용자가 무한 대기하지 않도록
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 35_000);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone: cleanPhone || null,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || '회원가입 중 오류가 발생했습니다.');
        setLoading(false);
        return;
      }

      setSuccess('회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
      setLoading(false);
      setIsSignup(false);
    } catch (err) {
      clearTimeout(tid);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('서버 응답이 35초를 초과했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.');
      } else {
        setError(err instanceof Error ? err.message : '서버 오류가 발생했습니다.');
      }
      setLoading(false);
    }
  };

  if (isSignup) {
    return (
      <form onSubmit={handleSignup} className="space-y-5">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            이름
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
            autoComplete="tel"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
            placeholder="010-1234-5678"
          />
        </div>

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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            비밀번호
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

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm" role="alert">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '가입 처리 중...' : '파트너 회원가입'}
        </button>

        <p className="text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{' '}
          <button type="button" onClick={() => setIsSignup(false)} className="text-[#E31837] font-semibold hover:underline">
            로그인
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none transition"
          placeholder="비밀번호 입력"
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
        {loading ? '로그인 중...' : '로그인'}
      </button>

      <div className="flex justify-center gap-3 text-sm text-gray-500">
        <Link href="/auth/find-id" className="hover:text-[#E31837] hover:underline">
          아이디 찾기
        </Link>
        <span>|</span>
        <Link href="/auth/reset-password" className="hover:text-[#E31837] hover:underline">
          비밀번호 찾기
        </Link>
      </div>

      <p className="text-center text-sm text-gray-500">
        파트너 계정이 없으신가요?{' '}
        <button type="button" onClick={() => setIsSignup(true)} className="text-[#E31837] font-semibold hover:underline">
          회원가입
        </button>
      </p>
    </form>
  );
}
