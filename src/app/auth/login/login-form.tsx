'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
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

    let supabase;
    try {
      supabase = createClient();
    } catch (err) {
      if (err instanceof Error && err.message === 'SUPABASE_NOT_CONFIGURED') {
        setError('서버 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.');
      } else {
        setError('연결 오류가 발생했습니다.');
      }
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      if (authError.message === 'Email not confirmed') {
        setError('이메일 인증이 완료되지 않았습니다. 가입 시 받은 이메일의 인증 링크를 클릭해주세요.');
      } else if (authError.message === 'Invalid login credentials') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (authError.status === 429) {
        setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(`로그인 오류: ${authError.message}`);
      }
      setLoading(false);
      return;
    }

    // 역할에 따라 리다이렉트
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (redirect) {
      router.push(redirect);
    } else if (profile?.role === 'admin' || profile?.role === 'partner') {
      router.push('/admin/dashboard');
    } else {
      router.push('/my/dashboard');
    }

    router.refresh();
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

    // 서버 API로 회원가입 (이메일 인증 자동 완료)
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName }),
    });

    const result = await res.json();

    if (!res.ok) {
      setError(result.error || '회원가입 중 오류가 발생했습니다.');
      setLoading(false);
      return;
    }

    // 가입 성공 → 바로 로그인 시도
    let supabase;
    try {
      supabase = createClient();
    } catch {
      setSuccess('회원가입이 완료되었습니다. 로그인해주세요.');
      setLoading(false);
      setIsSignup(false);
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setSuccess('회원가입이 완료되었습니다. 로그인해주세요.');
      setLoading(false);
      setIsSignup(false);
      return;
    }

    router.push('/my/dashboard');
    router.refresh();
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
          {loading ? '가입 중...' : '파트너 회원가입'}
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

      <p className="text-center text-sm text-gray-500">
        파트너 계정이 없으신가요?{' '}
        <button type="button" onClick={() => setIsSignup(true)} className="text-[#E31837] font-semibold hover:underline">
          회원가입
        </button>
      </p>
    </form>
  );
}
